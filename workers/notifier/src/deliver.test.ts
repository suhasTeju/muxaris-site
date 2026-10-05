import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@muxaris/db";
import {
  bookAppointment,
  createDoctor,
  createPatient,
  createService,
  queueAppointmentNotification,
  setWorkingHours,
} from "@muxaris/core";
import { deliverOnce } from "./deliver.js";
import type { NotificationProvider } from "./providers/types.js";
import { dbReachable, makeTestClinic, openDb } from "./test-support.js";

const reachable = await dbReachable();
if (!reachable) console.warn("WARNING: Postgres unreachable, skipping notifier tests.");
const { db, pool } = openDb();
const logs: Array<Record<string, unknown>> = [];
const log = (_level: string, _msg: string, fields?: object) => {
  logs.push((fields ?? {}) as Record<string, unknown>);
};

class FakeProvider implements NotificationProvider {
  readonly channel = "email" as const;
  sent: Array<{ to: string; subject: string }> = [];
  constructor(private readonly fail = false) {}
  async send(msg: { to: string; subject: string; body: string }) {
    if (this.fail) {
      const err = new Error("rejected by provider");
      err.name = "MessageRejected";
      throw err;
    }
    this.sent.push({ to: msg.to, subject: msg.subject });
    return { providerId: `fake-${this.sent.length}` };
  }
}

describe.skipIf(!reachable)("deliverOnce", () => {
  let c: Awaited<ReturnType<typeof makeTestClinic>>;
  let doctorId = "";
  let serviceId = "";
  beforeAll(async () => {
    c = await makeTestClinic(db, "notifier");
    const doc = await createDoctor(db, c.clinic.id, { name: "Dr Rao" });
    await setWorkingHours(
      db,
      c.clinic.id,
      doc.id,
      [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: "00:00", endTime: "23:59" })),
    );
    doctorId = doc.id;
    serviceId = (await createService(db, c.clinic.id, { name: "Cleaning", durationMin: 30 })).id;
  });
  afterAll(async () => {
    await c.cleanup();
    await pool.end();
  });

  let slot = 0;
  async function queuedRow(phone: string, email: string) {
    await createPatient(db, c.clinic.id, { phone, email });
    const startsAt = new Date(
      Math.floor((Date.now() + 2 * 86_400_000 + slot++ * 3_600_000) / 60_000) * 60_000,
    );
    const apt = await bookAppointment(db, {
      clinicId: c.clinic.id,
      patient: { phone },
      doctorId,
      serviceId,
      startsAt,
      source: "dashboard",
      allowOutsideRules: true,
      notify: { sms: false, whatsapp: false },
    });
    const [row] = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.appointmentId, apt.id));
    return row!;
  }

  const base = () => ({ db, log, clinicId: c.clinic.id });

  it("sends queued email rows and records the provider id, logging no recipient", async () => {
    const row = await queuedRow("+919876700001", "one@example.test");
    const email = new FakeProvider();
    const r = await deliverOnce({ ...base(), providers: { email, sms: null, whatsapp: null } }, 50);
    expect(r.sent).toBeGreaterThanOrEqual(1);
    expect(email.sent.some((s) => s.to === "one@example.test")).toBe(true);
    const [after] = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, row.id));
    expect(after?.status).toBe("sent");
    expect(after?.providerId).toMatch(/^fake-/);
    expect(JSON.stringify(logs)).not.toContain("example.test");
  });

  it("retries failures and finalises after five attempts", async () => {
    const row = await queuedRow("+919876700002", "two@example.test");
    const failing = new FakeProvider(true);
    let now = new Date();
    for (let i = 1; i <= 5; i++) {
      const r = await deliverOnce(
        { ...base(), providers: { email: failing, sms: null, whatsapp: null }, now: () => now },
        50,
      );
      expect(r.failed + r.retried).toBeGreaterThanOrEqual(1);
      now = new Date(now.getTime() + 6 * 60_000);
    }
    const [after] = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, row.id));
    expect(after?.status).toBe("failed");
    expect(after?.attempts).toBe(5);
    expect(after?.error).toBe("MessageRejected");
  });

  it("skips a queued reminder whose appointment was cancelled behind the service's back", async () => {
    const conf = await queuedRow("+919876700004", "four@example.test");
    const appointmentId = conf.appointmentId!;
    const reminder = await queueAppointmentNotification(db, {
      clinicId: c.clinic.id,
      appointmentId,
      kind: "reminder_24h",
      channels: { sms: false, whatsapp: false },
    });
    expect(reminder?.status).toBe("queued");
    await db
      .update(schema.appointments)
      .set({ status: "cancelled" })
      .where(eq(schema.appointments.id, appointmentId));
    const email = new FakeProvider();
    const r = await deliverOnce({ ...base(), providers: { email, sms: null, whatsapp: null } }, 50);
    expect(r.skipped).toBeGreaterThanOrEqual(2);
    expect(email.sent.some((s) => s.to === "four@example.test")).toBe(false);
    const after = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.appointmentId, appointmentId));
    expect(after.map((n) => [n.template, n.status, n.error]).sort()).toEqual([
      ["appointment_confirmed", "skipped", "superseded"],
      ["reminder_24h", "skipped", "superseded"],
    ]);
  });

  it("marks rows skipped when the channel has no provider", async () => {
    const row = await queuedRow("+919876700003", "three@example.test");
    await deliverOnce({ ...base(), providers: { email: null, sms: null, whatsapp: null } }, 50);
    const [after] = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, row.id));
    expect(after).toMatchObject({ status: "skipped", error: "channel_disabled" });
  });
});
