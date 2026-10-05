import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@muxaris/db";
import {
  claimQueuedNotifications,
  enqueueDueReminders,
  listNotifications,
  markNotificationFailed,
  markNotificationSent,
  retryNotification,
} from "./index.js";
import { createPatient, updatePatient } from "../services/patients.js";
import {
  bookAppointment,
  cancelAppointment,
  createDoctor,
  createService,
  rescheduleAppointment,
  setWorkingHours,
} from "../services/scheduling.js";
import {
  dbReachable,
  makeTestClinic,
  openDb,
  warnIfUnreachable,
} from "../services/test-support.js";

const reachable = await dbReachable();
warnIfUnreachable(reachable, "outbox tests");
const { db, pool } = openDb();
const OFF = { sms: false, whatsapp: false };
const H = 3600_000;
// bookings must start on a whole minute
const minuteNow = () => Math.floor(Date.now() / 60_000) * 60_000;

(reachable ? describe : describe.skip)("notification outbox", () => {
  let a: Awaited<ReturnType<typeof makeTestClinic>>;
  let doctorId: string;
  let serviceId: string;
  beforeAll(async () => {
    a = await makeTestClinic(db, "ntf");
    const doc = await createDoctor(db, a.clinic.id, { name: "Dr Rao" });
    await setWorkingHours(
      db,
      a.clinic.id,
      doc.id,
      [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: "00:00", endTime: "23:59" })),
    );
    doctorId = doc.id;
    serviceId = (await createService(db, a.clinic.id, { name: "Cleaning", durationMin: 30 })).id;
  });
  afterAll(async () => {
    await a.cleanup();
    await pool.end();
  });

  const book = (phone: string, startsAt: Date, name = "Ravi", forDoctor = doctorId) =>
    bookAppointment(db, {
      clinicId: a.clinic.id,
      patient: { phone, name },
      doctorId: forDoctor,
      serviceId,
      startsAt,
      source: "dashboard",
      allowOutsideRules: true,
      notify: OFF,
    });

  it("books with a skipped row when the patient has no email, and a queued email once they do", async () => {
    const t = new Date(minuteNow() + 3 * 86_400_000);
    const apt = await book("+919876600001", t);
    const l1 = await listNotifications(db, a.clinic.id, {
      appointmentId: apt.id,
      limit: 10,
      offset: 0,
    });
    expect(l1.total).toBe(1);
    expect(l1.notifications[0]).toMatchObject({
      status: "skipped",
      error: "no_contact",
      template: "appointment_confirmed",
    });
    expect("to" in (l1.notifications[0] ?? {})).toBe(false);

    await updatePatient(db, a.clinic.id, apt.patientId, { email: "ravi@example.test" });
    const retried = await retryNotification(db, {
      clinicId: a.clinic.id,
      notificationId: l1.notifications[0]!.id,
      channels: OFF,
    });
    expect(retried.status).toBe("queued");
    expect(retried.toMasked).toBe("r•••@example.test");
    expect(retried.payload.subject).toContain(a.clinic.name);
    expect(retried.payload.body).toContain("Ravi");
  });

  it("reschedule and cancel queue their own kinds and reschedule re-arms reminders", async () => {
    const t = new Date(minuteNow() + 4 * 86_400_000);
    const apt = await book("+919876600002", t);
    await db
      .update(schema.appointments)
      .set({ reminder24hSentAt: new Date(), reminder2hSentAt: new Date() })
      .where(eq(schema.appointments.id, apt.id));
    const moved = await rescheduleAppointment(db, {
      clinicId: a.clinic.id,
      appointmentId: apt.id,
      newStartsAt: new Date(t.getTime() + H),
      allowOutsideRules: true,
      notify: OFF,
    });
    expect(moved.reminder24hSentAt).toBeNull();
    expect(moved.reminder2hSentAt).toBeNull();
    await cancelAppointment(db, { clinicId: a.clinic.id, appointmentId: apt.id, notify: OFF });
    const l = await listNotifications(db, a.clinic.id, {
      appointmentId: apt.id,
      limit: 10,
      offset: 0,
    });
    expect(l.notifications.map((n) => n.template).sort()).toEqual([
      "appointment_cancelled",
      "appointment_confirmed",
      "appointment_rescheduled",
    ]);
  });

  it("honours the clinic's confirmations switch", async () => {
    await db
      .update(schema.clinics)
      .set({ settings: { notifications: { confirmations: false } } })
      .where(eq(schema.clinics.id, a.clinic.id));
    try {
      const apt = await book("+919876600003", new Date(minuteNow() + 5 * 86_400_000));
      const l = await listNotifications(db, a.clinic.id, {
        appointmentId: apt.id,
        limit: 10,
        offset: 0,
      });
      expect(l.total).toBe(0);
    } finally {
      await db
        .update(schema.clinics)
        .set({ settings: {} })
        .where(eq(schema.clinics.id, a.clinic.id));
    }
  });

  it("claims queued rows once, re-claims after the retry delay, and honours the failure and finality rules", async () => {
    const p = await createPatient(db, a.clinic.id, {
      phone: "+919876600004",
      email: "c@example.test",
    });
    const apt = await bookAppointment(db, {
      clinicId: a.clinic.id,
      patient: { phone: "+919876600004" },
      doctorId,
      serviceId,
      startsAt: new Date(minuteNow() + 6 * 86_400_000),
      source: "dashboard",
      allowOutsideRules: true,
      notify: OFF,
    });
    expect(apt.patientId).toBe(p.id);
    const now = new Date(minuteNow());
    const first = await claimQueuedNotifications(db, { now, limit: 50, clinicId: a.clinic.id });
    const mine = first.filter((n) => n.appointmentId === apt.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.attempts).toBe(1);
    const again = await claimQueuedNotifications(db, { now, limit: 50, clinicId: a.clinic.id });
    expect(again.some((n) => n.appointmentId === apt.id)).toBe(false);
    const later = new Date(now.getTime() + 6 * 60_000);
    const third = await claimQueuedNotifications(db, {
      now: later,
      limit: 50,
      clinicId: a.clinic.id,
    });
    expect(third.some((n) => n.appointmentId === apt.id)).toBe(true);
    await markNotificationFailed(db, mine[0]!.id, { error: "MessageRejected", final: false });
    let [row] = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, mine[0]!.id));
    expect(row?.status).toBe("queued");
    expect(row?.error).toBe("MessageRejected");
    await markNotificationFailed(db, mine[0]!.id, { error: "MessageRejected", final: true });
    [row] = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, mine[0]!.id));
    expect(row?.status).toBe("failed");
    // a late worker cannot overwrite a finalised row
    await markNotificationSent(db, mine[0]!.id, { providerId: "late" });
    [row] = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, mine[0]!.id));
    expect(row?.status).toBe("failed");
    // a queued row can be marked sent
    const apt2 = await book("+919876600009", new Date(minuteNow() + 7 * 86_400_000));
    const [q] = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.appointmentId, apt2.id));
    expect(q?.status).toBe("skipped"); // OFF flags and no email: skipped, so arrange a queued row
    await db
      .update(schema.notifications)
      .set({ status: "queued", to: "q@example.test", error: null })
      .where(eq(schema.notifications.id, q!.id));
    await markNotificationSent(db, q!.id, { providerId: "x" });
    [row] = await db.select().from(schema.notifications).where(eq(schema.notifications.id, q!.id));
    expect(row?.status).toBe("sent");
    expect(row?.sentAt).not.toBeNull();
  });

  it("fails rows that exhausted their attempts instead of claiming them", async () => {
    const apt = await book("+919876600010", new Date(minuteNow() + 8 * 86_400_000));
    const [q] = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.appointmentId, apt.id));
    await db
      .update(schema.notifications)
      .set({ status: "queued", to: "e@example.test", attempts: 5, nextAttemptAt: null })
      .where(eq(schema.notifications.id, q!.id));
    const claimed = await claimQueuedNotifications(db, { limit: 50, clinicId: a.clinic.id });
    expect(claimed.some((n) => n.id === q!.id)).toBe(false);
    const [row] = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, q!.id));
    expect(row).toMatchObject({ status: "failed", error: "max_attempts" });
  });

  it("queues 24h and 2h reminders in their windows, once, and not for fresh bookings", async () => {
    const now = new Date(minuteNow());
    const in23h = await book("+919876600005", new Date(now.getTime() + 23 * H));
    const in90m = await book("+919876600006", new Date(now.getTime() + 1.5 * H));
    const in10h = await book("+919876600007", new Date(now.getTime() + 10 * H));
    // the 90-minute booking was "created" 40 minutes ago so it is eligible
    await db
      .update(schema.appointments)
      .set({ createdAt: new Date(now.getTime() - 40 * 60_000) })
      .where(eq(schema.appointments.id, in90m.id));
    const r1 = await enqueueDueReminders(db, { now, channels: OFF, clinicId: a.clinic.id });
    expect(r1.queued24h).toBeGreaterThanOrEqual(1);
    expect(r1.queued2h).toBeGreaterThanOrEqual(1);
    const kinds = async (id: string) =>
      (
        await listNotifications(db, a.clinic.id, { appointmentId: id, limit: 10, offset: 0 })
      ).notifications
        .map((n) => n.template)
        .sort();
    expect(await kinds(in23h.id)).toEqual(["appointment_confirmed", "reminder_24h"]);
    expect(await kinds(in90m.id)).toEqual(["appointment_confirmed", "reminder_2h"]);
    expect(await kinds(in10h.id)).toEqual(["appointment_confirmed"]);
    // a second sweep adds nothing for my appointments
    await enqueueDueReminders(db, { now, channels: OFF, clinicId: a.clinic.id });
    expect(await kinds(in23h.id)).toEqual(["appointment_confirmed", "reminder_24h"]);
    expect(await kinds(in90m.id)).toEqual(["appointment_confirmed", "reminder_2h"]);
    // a fresh 90-minute booking gets no 2h reminder
    // (a second doctor, so it does not collide with the 90-minute booking above)
    const doc2 = await createDoctor(db, a.clinic.id, { name: "Dr Iyer" });
    await setWorkingHours(
      db,
      a.clinic.id,
      doc2.id,
      [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: "00:00", endTime: "23:59" })),
    );
    const fresh = await book("+919876600008", new Date(now.getTime() + 1.5 * H), "Ravi", doc2.id);
    await enqueueDueReminders(db, { now, channels: OFF, clinicId: a.clinic.id });
    expect(await kinds(fresh.id)).toEqual(["appointment_confirmed"]);
  });

  it("stamps but queues nothing when the clinic has reminders off", async () => {
    const now = new Date(minuteNow());
    await db
      .update(schema.clinics)
      .set({ settings: { notifications: { reminders: false } } })
      .where(eq(schema.clinics.id, a.clinic.id));
    try {
      const apt = await book("+919876600011", new Date(now.getTime() + 22 * H), "Ravi");
      const r = await enqueueDueReminders(db, { now, channels: OFF, clinicId: a.clinic.id });
      expect(r).toEqual({ queued24h: 0, queued2h: 0, failed: 0 });
      const [row] = await db
        .select()
        .from(schema.appointments)
        .where(eq(schema.appointments.id, apt.id));
      expect(row?.reminder24hSentAt).not.toBeNull();
      const l = await listNotifications(db, a.clinic.id, {
        appointmentId: apt.id,
        limit: 10,
        offset: 0,
      });
      expect(l.notifications.map((n) => n.template)).toEqual(["appointment_confirmed"]);
    } finally {
      await db
        .update(schema.clinics)
        .set({ settings: {} })
        .where(eq(schema.clinics.id, a.clinic.id));
    }
  });
});
