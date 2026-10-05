import { and, asc, count, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { schema, newId, type Db } from "@muxaris/db";
import {
  clinicNotificationSettings,
  maskEmail,
  maskPhone,
  type ChannelFlags,
  type NotificationKind,
  type SkipReason,
} from "@muxaris/shared";
import type { DbLike } from "../services/db-types.js";
import { CoreError } from "../services/errors.js";
import { formatWhen, renderNotification, templateLanguage } from "./templates.js";

const { notifications, appointments, patients, doctors, services, clinics } = schema;

export type NotificationRow = typeof notifications.$inferSelect;
export type NotificationView = Omit<NotificationRow, "to"> & { toMasked: string };
export function toNotificationView(row: NotificationRow): NotificationView {
  const { to, ...rest } = row;
  const toMasked = !to ? "" : row.channel === "email" ? maskEmail(to) : maskPhone(to);
  return { ...rest, toMasked };
}

export const MAX_ATTEMPTS = 5;
const DEFAULT_RETRY_MS = 5 * 60_000;
const REMINDER_KINDS: NotificationKind[] = ["reminder_24h", "reminder_2h"];

/** Email when on file; else WhatsApp, then SMS when the platform flags allow; else nothing. */
export function chooseChannel(
  patient: { email: string | null; phone: string },
  channels: ChannelFlags,
): { channel: "email" | "sms" | "whatsapp"; to: string } | null {
  if (patient.email) return { channel: "email", to: patient.email };
  if (channels.whatsapp) return { channel: "whatsapp", to: patient.phone };
  if (channels.sms) return { channel: "sms", to: patient.phone };
  return null;
}

async function loadContext(tx: DbLike, clinicId: string, appointmentId: string) {
  const [apt] = await tx
    .select()
    .from(appointments)
    .where(and(eq(appointments.id, appointmentId), eq(appointments.clinicId, clinicId)));
  if (!apt) throw new CoreError("not_found", "appointment not found");
  const [[patient], [doctor], [service], [clinic]] = await Promise.all([
    tx.select().from(patients).where(eq(patients.id, apt.patientId)),
    tx.select({ name: doctors.name }).from(doctors).where(eq(doctors.id, apt.doctorId)),
    tx.select({ name: services.name }).from(services).where(eq(services.id, apt.serviceId)),
    tx.select().from(clinics).where(eq(clinics.id, clinicId)),
  ]);
  if (!patient || !clinic) throw new CoreError("not_found", "appointment context missing");
  return { apt, patient, doctorName: doctor?.name ?? "", serviceName: service?.name ?? "", clinic };
}

/**
 * Writes one fully rendered outbox row for an appointment event, inside the caller's transaction.
 * Returns null when the clinic has switched that kind of message off.
 */
export async function queueAppointmentNotification(
  tx: DbLike,
  input: {
    clinicId: string;
    appointmentId: string;
    kind: NotificationKind;
    channels: ChannelFlags;
    now?: Date;
  },
): Promise<NotificationRow | null> {
  const { apt, patient, doctorName, serviceName, clinic } = await loadContext(
    tx,
    input.clinicId,
    input.appointmentId,
  );
  const settings = clinicNotificationSettings(clinic.settings);
  const isReminder = REMINDER_KINDS.includes(input.kind);
  if (isReminder ? !settings.reminders : !settings.confirmations) return null;
  const lang = templateLanguage(patient.preferredLanguage);
  const rendered = renderNotification(input.kind, lang, {
    patientName: patient.name,
    clinicName: clinic.name,
    doctorName,
    serviceName,
    when: formatWhen(apt.startsAt, clinic.timezone, lang),
    clinicPhone: clinic.phone,
  });
  const target = chooseChannel(patient, input.channels);
  const [row] = await tx
    .insert(notifications)
    .values({
      id: newId("ntf"),
      clinicId: input.clinicId,
      patientId: patient.id,
      appointmentId: apt.id,
      channel: target?.channel ?? "email",
      to: target?.to ?? "",
      template: input.kind,
      language: lang,
      payload: rendered,
      status: target ? "queued" : "skipped",
      error: target ? null : ("no_contact" satisfies SkipReason),
      ...(input.now ? { createdAt: input.now } : {}),
    })
    .returning();
  return row!;
}

/** Claims up to `limit` due rows for one delivery attempt; a crashed worker's rows return after retryAfterMs. */
export async function claimQueuedNotifications(
  db: Db,
  opts: { limit?: number; now?: Date; retryAfterMs?: number } = {},
): Promise<NotificationRow[]> {
  const now = opts.now ?? new Date();
  const retryAt = new Date(now.getTime() + (opts.retryAfterMs ?? DEFAULT_RETRY_MS));
  return db.transaction(async (tx) => {
    const due = await tx
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.status, "queued"),
          or(isNull(notifications.nextAttemptAt), lte(notifications.nextAttemptAt, now)),
        ),
      )
      .orderBy(asc(notifications.createdAt))
      .limit(opts.limit ?? 20)
      .for("update", { skipLocked: true });
    if (due.length === 0) return [];
    const ids = due.map((d) => d.id);
    const rows = await tx
      .update(notifications)
      .set({ attempts: sql`${notifications.attempts} + 1`, nextAttemptAt: retryAt })
      .where(inArray(notifications.id, ids))
      .returning();
    return rows;
  });
}

export async function markNotificationSent(
  db: Db,
  id: string,
  opts: { providerId: string; now?: Date },
): Promise<void> {
  await db
    .update(notifications)
    .set({
      status: "sent",
      providerId: opts.providerId,
      error: null,
      sentAt: opts.now ?? new Date(),
    })
    .where(eq(notifications.id, id));
}

export async function markNotificationFailed(
  db: Db,
  id: string,
  opts: { error: string; final: boolean },
): Promise<void> {
  await db
    .update(notifications)
    .set({ error: opts.error.slice(0, 200), ...(opts.final ? { status: "failed" } : {}) })
    .where(eq(notifications.id, id));
}

export async function markNotificationSkipped(
  db: Db,
  id: string,
  opts: { reason: SkipReason },
): Promise<void> {
  await db
    .update(notifications)
    .set({ status: "skipped", error: opts.reason })
    .where(eq(notifications.id, id));
}

export async function listNotifications(
  db: Db,
  clinicId: string,
  opts: {
    status?: NotificationRow["status"];
    appointmentId?: string;
    patientId?: string;
    limit: number;
    offset: number;
  },
): Promise<{ notifications: NotificationView[]; total: number }> {
  const where = and(
    eq(notifications.clinicId, clinicId),
    opts.status ? eq(notifications.status, opts.status) : undefined,
    opts.appointmentId ? eq(notifications.appointmentId, opts.appointmentId) : undefined,
    opts.patientId ? eq(notifications.patientId, opts.patientId) : undefined,
  );
  const [rows, [tot]] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(where)
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(opts.limit)
      .offset(opts.offset),
    db.select({ n: count() }).from(notifications).where(where),
  ]);
  return { notifications: rows.map(toNotificationView), total: Number(tot?.n ?? 0) };
}

/** Staff retry: re-picks the channel from the patient's current contact details. */
export async function retryNotification(
  db: Db,
  input: { clinicId: string; notificationId: string; channels: ChannelFlags },
): Promise<NotificationView> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(notifications)
      .where(
        and(eq(notifications.id, input.notificationId), eq(notifications.clinicId, input.clinicId)),
      )
      .for("update");
    if (!row) throw new CoreError("not_found", "notification not found");
    if (row.status !== "failed" && row.status !== "skipped")
      throw new CoreError("conflict", `cannot retry a ${row.status} notification`);
    const [patient] = row.patientId
      ? await tx.select().from(patients).where(eq(patients.id, row.patientId))
      : [];
    const target = patient ? chooseChannel(patient, input.channels) : null;
    const [updated] = await tx
      .update(notifications)
      .set(
        target
          ? {
              status: "queued",
              channel: target.channel,
              to: target.to,
              attempts: 0,
              nextAttemptAt: null,
              error: null,
            }
          : { status: "skipped", error: "no_contact" satisfies SkipReason },
      )
      .where(eq(notifications.id, row.id))
      .returning();
    return toNotificationView(updated!);
  });
}
