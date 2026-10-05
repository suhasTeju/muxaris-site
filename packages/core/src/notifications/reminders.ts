import { and, asc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { schema, type Db } from "@muxaris/db";
import type { ChannelFlags } from "@muxaris/shared";
import { queueAppointmentNotification } from "./outbox.js";

const { appointments } = schema;
const H = 3600_000;
const ACTIVE = ["scheduled", "confirmed", "rescheduled"] as const;

/**
 * 24 h reminder: starts in (20 h, 24 h], not yet stamped.
 * 2 h reminder: starts in (1 h, 2 h], not yet stamped, booked at least 30 min ago (fresh bookings
 * already received a confirmation). Stamps are written in the same transaction as the outbox row,
 * so each reminder is queued at most once even with concurrent sweeps.
 */
export async function enqueueDueReminders(
  db: Db,
  opts: { now?: Date; channels: ChannelFlags; clinicId?: string },
): Promise<{ queued24h: number; queued2h: number; failed: number }> {
  const now = opts.now ?? new Date();
  const result = { queued24h: 0, queued2h: 0, failed: 0 };
  await db.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(appointments)
      .where(
        and(
          opts.clinicId ? eq(appointments.clinicId, opts.clinicId) : undefined,
          inArray(appointments.status, [...ACTIVE]),
          or(
            and(
              isNull(appointments.reminder24hSentAt),
              gt(appointments.startsAt, new Date(now.getTime() + 20 * H)),
              lte(appointments.startsAt, new Date(now.getTime() + 24 * H)),
            ),
            and(
              isNull(appointments.reminder2hSentAt),
              gt(appointments.startsAt, new Date(now.getTime() + 1 * H)),
              lte(appointments.startsAt, new Date(now.getTime() + 2 * H)),
              lte(appointments.createdAt, new Date(now.getTime() - 30 * 60_000)),
            ),
          ),
        ),
      )
      .orderBy(asc(appointments.startsAt))
      .limit(200)
      .for("update", { skipLocked: true });
    for (const apt of due) {
      const until = apt.startsAt.getTime() - now.getTime();
      const kind = until > 2 * H ? "reminder_24h" : "reminder_2h";
      try {
        // savepoint: one bad row must not roll back the rest of the sweep
        const queued = await tx.transaction(async (sp) => {
          await sp
            .update(appointments)
            .set(kind === "reminder_24h" ? { reminder24hSentAt: now } : { reminder2hSentAt: now })
            .where(eq(appointments.id, apt.id));
          return queueAppointmentNotification(sp, {
            clinicId: apt.clinicId,
            appointmentId: apt.id,
            kind,
            channels: opts.channels,
            now,
          });
        });
        if (!queued) continue; // clinic has reminders off: stamped, nothing queued
        if (kind === "reminder_24h") result.queued24h++;
        else result.queued2h++;
      } catch {
        result.failed++;
      }
    }
  });
  return result;
}
