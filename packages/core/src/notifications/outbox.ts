import { and, asc, count, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { schema, newId, type Db } from "@muxaris/db";
import {
  NOTIFICATION_KINDS,
  clinicNotificationSettings,
  maskEmail,
  maskPhone,
  type ChannelFlags,
  type NotificationKind,
  type SkipReason,
} from "@muxaris/shared";
import { isActiveAppointmentStatus } from "../services/appointment-status.js";
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
const H = 3600_000;

function isNotificationKind(v: string): v is NotificationKind {
  return (NOTIFICATION_KINDS as readonly string[]).includes(v);
}

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
  // sequential: a transaction client must not run concurrent queries
  const [patient] = await tx.select().from(patients).where(eq(patients.id, apt.patientId));
  const [doctor] = await tx
    .select({ name: doctors.name })
    .from(doctors)
    .where(eq(doctors.id, apt.doctorId));
  const [service] = await tx
    .select({ name: services.name })
    .from(services)
    .where(eq(services.id, apt.serviceId));
  const [clinic] = await tx.select().from(clinics).where(eq(clinics.id, clinicId));
  if (!patient || !clinic) throw new CoreError("not_found", "appointment context missing");
  return { apt, patient, doctorName: doctor?.name ?? "", serviceName: service?.name ?? "", clinic };
}

type AppointmentContext = Awaited<ReturnType<typeof loadContext>>;

/** Renders a message from the appointment as it is now, in the patient's language. */
function renderFromContext(ctx: AppointmentContext, kind: NotificationKind) {
  const lang = templateLanguage(ctx.patient.preferredLanguage);
  const payload = renderNotification(kind, lang, {
    patientName: ctx.patient.name,
    clinicName: ctx.clinic.name,
    doctorName: ctx.doctorName,
    serviceName: ctx.serviceName,
    when: formatWhen(ctx.apt.startsAt, ctx.clinic.timezone, lang),
    clinicPhone: ctx.clinic.phone,
  });
  return { lang, payload };
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
  const ctx = await loadContext(tx, input.clinicId, input.appointmentId);
  const { apt, patient, clinic } = ctx;
  const settings = clinicNotificationSettings(clinic.settings);
  const isReminder = REMINDER_KINDS.includes(input.kind);
  if (isReminder ? !settings.reminders : !settings.confirmations) return null;
  const { lang, payload: rendered } = renderFromContext(ctx, input.kind);
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

/**
 * Marks every still-queued message for an appointment `skipped/superseded`. Called inside the
 * reschedule and cancel transactions before the new message is written, so a queued or retrying
 * confirmation or reminder for the old time never goes out. Sent, failed and skipped rows are kept.
 */
export async function supersedeQueuedForAppointment(
  tx: DbLike,
  clinicId: string,
  appointmentId: string,
): Promise<number> {
  const rows = await tx
    .update(notifications)
    .set({ status: "skipped", error: "superseded" satisfies SkipReason })
    .where(
      and(
        eq(notifications.clinicId, clinicId),
        eq(notifications.appointmentId, appointmentId),
        eq(notifications.status, "queued"),
      ),
    )
    .returning({ id: notifications.id });
  return rows.length;
}

/**
 * Reminder stamps to set when a confirmation or reschedule message was actually queued: a 24 h
 * reminder is redundant when the visit is at most 24.5 h away, a 2 h reminder when it is at most
 * 2.5 h away. Without this the patient gets the confirmation and a reminder back to back.
 */
export function reminderStampsForFreshConfirmation(
  startsAt: Date,
  now: Date,
): { reminder24hSentAt?: Date; reminder2hSentAt?: Date } {
  const until = startsAt.getTime() - now.getTime();
  // Half-hour margins: a visit just outside a window enters it before the next sweep,
  // and the confirmation already carries the time.
  return {
    ...(until <= 24.5 * H ? { reminder24hSentAt: now } : {}),
    ...(until <= 2.5 * H ? { reminder2hSentAt: now } : {}),
  };
}

/**
 * Delivery-time backstop: false when the appointment is gone, no longer active or already
 * started, so a stale message is not sent. A cancellation notice is always deliverable.
 */
export async function appointmentStillDeliverable(
  db: DbLike,
  clinicId: string,
  appointmentId: string,
  kind: string,
  now: Date = new Date(),
): Promise<boolean> {
  if (kind === "appointment_cancelled") return true;
  const [apt] = await db
    .select({ status: appointments.status, startsAt: appointments.startsAt })
    .from(appointments)
    .where(and(eq(appointments.id, appointmentId), eq(appointments.clinicId, clinicId)));
  if (!apt) return false;
  return isActiveAppointmentStatus(apt.status) && apt.startsAt > now;
}

/** Claims up to `limit` due rows for one delivery attempt; a crashed worker's rows return after retryAfterMs. */
export async function claimQueuedNotifications(
  db: Db,
  opts: { limit?: number; now?: Date; retryAfterMs?: number; clinicId?: string } = {},
): Promise<NotificationRow[]> {
  const now = opts.now ?? new Date();
  const retryAt = new Date(now.getTime() + (opts.retryAfterMs ?? DEFAULT_RETRY_MS));
  return db.transaction(async (tx) => {
    const due = await tx
      .select({ id: notifications.id, attempts: notifications.attempts })
      .from(notifications)
      .where(
        and(
          eq(notifications.status, "queued"),
          opts.clinicId ? eq(notifications.clinicId, opts.clinicId) : undefined,
          or(isNull(notifications.nextAttemptAt), lte(notifications.nextAttemptAt, now)),
        ),
      )
      .orderBy(asc(notifications.createdAt))
      .limit(opts.limit ?? 20)
      .for("update", { skipLocked: true });
    if (due.length === 0) return [];
    const exhausted = due.filter((d) => d.attempts >= MAX_ATTEMPTS).map((d) => d.id);
    const ids = due.filter((d) => d.attempts < MAX_ATTEMPTS).map((d) => d.id);
    if (exhausted.length > 0) {
      await tx
        .update(notifications)
        .set({ status: "failed", error: "max_attempts" })
        .where(inArray(notifications.id, exhausted));
    }
    if (ids.length === 0) return [];
    return tx
      .update(notifications)
      .set({ attempts: sql`${notifications.attempts} + 1`, nextAttemptAt: retryAt })
      .where(inArray(notifications.id, ids))
      .returning();
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
    .where(and(eq(notifications.id, id), eq(notifications.status, "queued")));
}

export async function markNotificationFailed(
  db: Db,
  id: string,
  opts: { error: string; final: boolean },
): Promise<void> {
  await db
    .update(notifications)
    .set({ error: opts.error.slice(0, 200), ...(opts.final ? { status: "failed" } : {}) })
    .where(and(eq(notifications.id, id), eq(notifications.status, "queued")));
}

export async function markNotificationSkipped(
  db: Db,
  id: string,
  opts: { reason: SkipReason },
): Promise<void> {
  await db
    .update(notifications)
    .set({ status: "skipped", error: opts.reason })
    .where(and(eq(notifications.id, id), eq(notifications.status, "queued")));
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

/**
 * Staff retry. For an appointment message, the subject, body, language and recipient are rendered
 * again from the appointment and patient as they are now, so a retry never carries a stale time.
 * Conflict when the message was superseded, the appointment is no longer active (except for a
 * cancellation notice) or its time has passed.
 */
export async function retryNotification(
  db: Db,
  input: { clinicId: string; notificationId: string; channels: ChannelFlags; now?: Date },
): Promise<NotificationView> {
  const now = input.now ?? new Date();
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
    if (row.error === ("superseded" satisfies SkipReason))
      throw new CoreError("conflict", "this message was replaced by a later one");

    let patient: { email: string | null; phone: string } | undefined;
    let rendered: { language: string; payload: Record<string, unknown> } | null = null;
    if (row.appointmentId) {
      if (!isNotificationKind(row.template))
        throw new CoreError("conflict", "this message can no longer be retried");
      const ctx = await loadContext(tx, input.clinicId, row.appointmentId);
      if (row.template !== "appointment_cancelled" && !isActiveAppointmentStatus(ctx.apt.status))
        throw new CoreError("conflict", `the appointment is ${ctx.apt.status}`);
      if (ctx.apt.startsAt <= now)
        throw new CoreError("conflict", "the appointment time has passed");
      const { lang, payload } = renderFromContext(ctx, row.template);
      patient = ctx.patient;
      rendered = { language: lang, payload };
    } else if (row.patientId) {
      [patient] = await tx.select().from(patients).where(eq(patients.id, row.patientId));
    }
    const target = patient ? chooseChannel(patient, input.channels) : null;
    const [updated] = await tx
      .update(notifications)
      .set({
        ...(rendered ?? {}),
        ...(target
          ? {
              status: "queued" as const,
              channel: target.channel,
              to: target.to,
              attempts: 0,
              nextAttemptAt: null,
              error: null,
            }
          : { status: "skipped" as const, error: "no_contact" satisfies SkipReason }),
      })
      .where(eq(notifications.id, row.id))
      .returning();
    return toNotificationView(updated!);
  });
}
