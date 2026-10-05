import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@muxaris/db";
import {
  appointmentStillDeliverable,
  claimQueuedNotifications,
  enqueueDueReminders,
  formatWhen,
  listNotifications,
  markNotificationFailed,
  markNotificationSent,
  retryNotification,
  templateLanguage,
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
  const rowsFor = (appointmentId: string) =>
    db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.appointmentId, appointmentId));
  const rowOf = async (appointmentId: string, template: string) =>
    (await rowsFor(appointmentId)).find((r) => r.template === template);
  const withEmail = (phone: string, email: string) =>
    createPatient(db, a.clinic.id, { phone, email });

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

  it("cancel supersedes a queued confirmation that is waiting to retry", async () => {
    await withEmail("+919876600012", "s1@example.test");
    const apt = await book("+919876600012", new Date(minuteNow() + 9 * 86_400_000));
    const conf = await rowOf(apt.id, "appointment_confirmed");
    expect(conf?.status).toBe("queued");
    const now = new Date();
    const claimed = await claimQueuedNotifications(db, { now, limit: 50, clinicId: a.clinic.id });
    expect(claimed.some((n) => n.id === conf!.id)).toBe(true);
    await markNotificationFailed(db, conf!.id, { error: "Throttling", final: false });
    const waiting = await rowOf(apt.id, "appointment_confirmed");
    expect(waiting?.status).toBe("queued");
    expect(waiting!.nextAttemptAt!.getTime()).toBeGreaterThan(now.getTime());

    await cancelAppointment(db, { clinicId: a.clinic.id, appointmentId: apt.id, notify: OFF });
    expect(await rowOf(apt.id, "appointment_confirmed")).toMatchObject({
      status: "skipped",
      error: "superseded",
    });
    expect(await rowOf(apt.id, "appointment_cancelled")).toMatchObject({
      status: "queued",
      error: null,
    });
  });

  it("reschedule supersedes queued messages whether or not a new one is written", async () => {
    await withEmail("+919876600013", "s2@example.test");
    const t = new Date(minuteNow() + 10 * 86_400_000);
    const apt = await book("+919876600013", t);
    expect((await rowOf(apt.id, "appointment_confirmed"))?.status).toBe("queued");
    await rescheduleAppointment(db, {
      clinicId: a.clinic.id,
      appointmentId: apt.id,
      newStartsAt: new Date(t.getTime() + H),
      allowOutsideRules: true,
      notify: OFF,
    });
    expect(await rowOf(apt.id, "appointment_confirmed")).toMatchObject({
      status: "skipped",
      error: "superseded",
    });
    expect((await rowOf(apt.id, "appointment_rescheduled"))?.status).toBe("queued");
    // no notify flags: nothing new is written, but the queued message for the old time is dropped
    await rescheduleAppointment(db, {
      clinicId: a.clinic.id,
      appointmentId: apt.id,
      newStartsAt: new Date(t.getTime() + 2 * H),
      allowOutsideRules: true,
    });
    const rows = await rowsFor(apt.id);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === "skipped" && r.error === "superseded")).toBe(true);
  });

  it("retry renders the message again from the appointment as it is now", async () => {
    const t = new Date(minuteNow() + 11 * 86_400_000);
    const apt = await book("+919876600014", t);
    const conf = await rowOf(apt.id, "appointment_confirmed");
    expect(conf).toMatchObject({ status: "skipped", error: "no_contact" });
    const newT = new Date(t.getTime() + 2 * H);
    await rescheduleAppointment(db, {
      clinicId: a.clinic.id,
      appointmentId: apt.id,
      newStartsAt: newT,
      allowOutsideRules: true,
      notify: OFF,
    });
    // a skipped row is not superseded: it was never going out
    expect((await rowOf(apt.id, "appointment_confirmed"))?.error).toBe("no_contact");
    await updatePatient(db, a.clinic.id, apt.patientId, { email: "r1@example.test" });
    const retried = await retryNotification(db, {
      clinicId: a.clinic.id,
      notificationId: conf!.id,
      channels: OFF,
    });
    const lang = templateLanguage(retried.language);
    expect(retried.status).toBe("queued");
    expect(retried.toMasked).toBe("r•••@example.test");
    expect(retried.payload.body).toContain(formatWhen(newT, a.clinic.timezone, lang));
    expect(retried.payload.body).not.toContain(formatWhen(t, a.clinic.timezone, lang));
  });

  it("retry refuses superseded messages, inactive appointments and past times", async () => {
    const conflict = { code: "conflict" };
    const retry = (notificationId: string, now?: Date) =>
      retryNotification(db, {
        clinicId: a.clinic.id,
        notificationId,
        channels: OFF,
        ...(now ? { now } : {}),
      });
    // superseded
    await withEmail("+919876600015", "s3@example.test");
    const a1 = await book("+919876600015", new Date(minuteNow() + 12 * 86_400_000));
    await cancelAppointment(db, { clinicId: a.clinic.id, appointmentId: a1.id, notify: OFF });
    const superseded = await rowOf(a1.id, "appointment_confirmed");
    expect(superseded?.error).toBe("superseded");
    await expect(retry(superseded!.id)).rejects.toMatchObject(conflict);
    // cancelled appointment: the confirmation is refused, the cancellation notice is allowed
    const a2 = await book("+919876600016", new Date(minuteNow() + 12 * 86_400_000 + H));
    await cancelAppointment(db, { clinicId: a.clinic.id, appointmentId: a2.id, notify: OFF });
    await updatePatient(db, a.clinic.id, a2.patientId, { email: "s4@example.test" });
    const conf2 = await rowOf(a2.id, "appointment_confirmed");
    expect(conf2?.error).toBe("no_contact");
    await expect(retry(conf2!.id)).rejects.toMatchObject(conflict);
    const cancelNotice = await rowOf(a2.id, "appointment_cancelled");
    expect((await retry(cancelNotice!.id)).status).toBe("queued");
    // appointment time has passed
    const a3 = await book("+919876600017", new Date(minuteNow() + 13 * 86_400_000));
    await updatePatient(db, a.clinic.id, a3.patientId, { email: "s5@example.test" });
    const conf3 = await rowOf(a3.id, "appointment_confirmed");
    await expect(retry(conf3!.id, new Date(a3.startsAt.getTime() + 60_000))).rejects.toMatchObject(
      conflict,
    );
    expect((await rowOf(a3.id, "appointment_confirmed"))?.status).toBe("skipped");
  });

  it("knows when an appointment message is still worth delivering", async () => {
    const apt = await book("+919876600018", new Date(minuteNow() + 14 * 86_400_000));
    const at = (now: Date, kind = "reminder_24h") =>
      appointmentStillDeliverable(db, a.clinic.id, apt.id, kind, now);
    expect(await at(new Date())).toBe(true);
    expect(await at(apt.startsAt)).toBe(false);
    await cancelAppointment(db, { clinicId: a.clinic.id, appointmentId: apt.id });
    expect(await at(new Date())).toBe(false);
    expect(await at(new Date(), "appointment_cancelled")).toBe(true);
    expect(await appointmentStillDeliverable(db, "cln_other", apt.id, "reminder_2h")).toBe(false);
  });

  it("queues 24h and 2h reminders in their windows, once, and not for fresh bookings", async () => {
    const now = new Date(minuteNow());
    // These patients have no email: their confirmations are skipped, so the reminders are not
    // pre-empted (see the next test for patients with an email on file).
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

  it("a queued confirmation pre-empts the reminders it makes redundant; a skipped one does not", async () => {
    const now = new Date(minuteNow());
    const doc3 = await createDoctor(db, a.clinic.id, { name: "Dr Shah" });
    await setWorkingHours(
      db,
      a.clinic.id,
      doc3.id,
      [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: "00:00", endTime: "23:59" })),
    );
    const templates = async (id: string) => (await rowsFor(id)).map((r) => r.template).sort();
    // email on file, booked 22 h ahead: confirmation queued, the 24 h reminder is pre-empted
    await withEmail("+919876600019", "near@example.test");
    const near = await book("+919876600019", new Date(now.getTime() + 22 * H), "Ravi", doc3.id);
    expect((await rowOf(near.id, "appointment_confirmed"))?.status).toBe("queued");
    expect(near.reminder24hSentAt).not.toBeNull();
    expect(near.reminder2hSentAt).toBeNull();
    // no email, 23 h ahead: confirmation skipped, nothing stamped; the email is added afterwards
    const late = await book("+919876600020", new Date(now.getTime() + 23 * H), "Ravi", doc3.id);
    expect(await rowOf(late.id, "appointment_confirmed")).toMatchObject({
      status: "skipped",
      error: "no_contact",
    });
    expect(late.reminder24hSentAt).toBeNull();
    expect(late.reminder2hSentAt).toBeNull();
    await updatePatient(db, a.clinic.id, late.patientId, { email: "late@example.test" });
    // email on file, booked days ago, rescheduled to 90 minutes ahead: both reminders pre-empted
    await withEmail("+919876600021", "moved@example.test");
    const old = await book(
      "+919876600021",
      new Date(now.getTime() + 5 * 86_400_000),
      "Ravi",
      doc3.id,
    );
    await db
      .update(schema.appointments)
      .set({ createdAt: new Date(now.getTime() - 2 * 86_400_000) })
      .where(eq(schema.appointments.id, old.id));
    const moved = await rescheduleAppointment(db, {
      clinicId: a.clinic.id,
      appointmentId: old.id,
      newStartsAt: new Date(now.getTime() + 1.5 * H),
      allowOutsideRules: true,
      notify: OFF,
    });
    expect(moved.reminder24hSentAt).not.toBeNull();
    expect(moved.reminder2hSentAt).not.toBeNull();

    await enqueueDueReminders(db, { now, channels: OFF, clinicId: a.clinic.id });
    expect(await templates(near.id)).toEqual(["appointment_confirmed"]);
    const movedRows = await rowsFor(old.id);
    expect(movedRows.filter((r) => r.status === "queued").map((r) => r.template)).toEqual([
      "appointment_rescheduled",
    ]);
    expect(movedRows.some((r) => r.template === "reminder_2h")).toBe(false);
    expect(await rowOf(late.id, "reminder_24h")).toMatchObject({ status: "queued" });

    // the 2 h reminder still fires for the 22 h booking when its window comes round
    await enqueueDueReminders(db, {
      now: new Date(near.startsAt.getTime() - 1.5 * H),
      channels: OFF,
      clinicId: a.clinic.id,
    });
    expect(await templates(near.id)).toEqual(["appointment_confirmed", "reminder_2h"]);
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
