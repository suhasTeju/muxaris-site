import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@muxaris/db";
import { CoreError } from "./errors.js";
import {
  createPatient,
  getPatient,
  listPatients,
  revealPatientPhone,
  updatePatient,
} from "./patients.js";
import {
  bookAppointment,
  createDoctor,
  createService,
  setAppointmentOutcome,
  setWorkingHours,
} from "./scheduling.js";
import { dbReachable, makeTestClinic, openDb, warnIfUnreachable } from "./test-support.js";

const reachable = await dbReachable();
warnIfUnreachable(reachable, "patients tests");
const { db, pool } = openDb();

(reachable ? describe : describe.skip)("patients", () => {
  let a: Awaited<ReturnType<typeof makeTestClinic>>;
  let b: Awaited<ReturnType<typeof makeTestClinic>>;
  beforeAll(async () => {
    a = await makeTestClinic(db, "pat-a");
    b = await makeTestClinic(db, "pat-b");
  });
  afterAll(async () => {
    await a.cleanup();
    await b.cleanup();
    await pool.end();
  });

  it("creates, lists (masked) and refuses a duplicate phone", async () => {
    const p = await createPatient(db, a.clinic.id, { phone: "+919876543210", name: "Ravi" });
    expect(p.phoneMasked).toBe("+91 •••• ••3210");
    expect("phone" in p).toBe(false);
    await expect(createPatient(db, a.clinic.id, { phone: "+919876543210" })).rejects.toMatchObject({
      code: "conflict",
    });
    const list = await listPatients(db, a.clinic.id, { q: "rav", limit: 10, offset: 0 });
    expect(list.total).toBe(1);
    expect(list.patients[0]?.id).toBe(p.id);
    expect((await listPatients(db, b.clinic.id, { limit: 10, offset: 0 })).total).toBe(0);
  });

  it("updates fields, clears with null and bumps updatedAt", async () => {
    const p = await createPatient(db, a.clinic.id, { phone: "+919876543211", notes: "x" });
    const u = await updatePatient(db, a.clinic.id, p.id, { email: "r@example.test", notes: null });
    expect(u.email).toBe("r@example.test");
    expect(u.notes).toBeNull();
    expect(u.updatedAt.getTime()).toBeGreaterThanOrEqual(p.updatedAt.getTime());
    await expect(updatePatient(db, b.clinic.id, p.id, { name: "x" })).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("reveal returns the raw phone and writes an audit row without the number", async () => {
    const p = await createPatient(db, a.clinic.id, { phone: "+919876543212" });
    const r = await revealPatientPhone(db, {
      clinicId: a.clinic.id,
      patientId: p.id,
      actorUserId: a.user.id,
    });
    expect(r.phone).toBe("+919876543212");
    const [aud] = await db.select().from(schema.auditLog).where(eq(schema.auditLog.entityId, p.id));
    expect(aud?.action).toBe("patient.phone.reveal");
    expect(JSON.stringify(aud?.data ?? {})).not.toContain("3212");
    await expect(
      revealPatientPhone(db, { clinicId: b.clinic.id, patientId: p.id, actorUserId: b.user.id }),
    ).rejects.toBeInstanceOf(CoreError);
  });

  it("getPatient returns visit history newest first and marks no-show only after start", async () => {
    const doc = await createDoctor(db, a.clinic.id, { name: "Dr Rao" });
    await setWorkingHours(
      db,
      a.clinic.id,
      doc.id,
      [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startTime: "09:00", endTime: "18:00" })),
    );
    const svc = await createService(db, a.clinic.id, { name: "Cleaning", durationMin: 30 });
    const past = new Date(Date.now() - 3 * 86_400_000);
    past.setUTCHours(5, 30, 0, 0); // 11:00 IST
    const apt = await bookAppointment(db, {
      clinicId: a.clinic.id,
      patient: { phone: "+919876543213", name: "Meena" },
      doctorId: doc.id,
      serviceId: svc.id,
      startsAt: past,
      source: "dashboard",
      allowOutsideRules: true,
      now: new Date(past.getTime() - 86_400_000), // booking guards reject the past
    });
    const detail = await getPatient(db, a.clinic.id, apt.patientId);
    expect(detail.appointments[0]?.id).toBe(apt.id);
    expect(detail.patient.phoneMasked.endsWith("3213")).toBe(true);
    const done = await setAppointmentOutcome(db, {
      clinicId: a.clinic.id,
      appointmentId: apt.id,
      status: "no_show",
      actorUserId: a.user.id,
    });
    expect(done.status).toBe("no_show");
    await expect(
      setAppointmentOutcome(db, {
        clinicId: a.clinic.id,
        appointmentId: apt.id,
        status: "completed",
        actorUserId: a.user.id,
      }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("refuses to mark a future appointment", async () => {
    const doc = await createDoctor(db, a.clinic.id, { name: "Dr Future" });
    const svc = await createService(db, a.clinic.id, { name: "Check", durationMin: 30 });
    const future = new Date(Date.now() + 5 * 86_400_000);
    future.setUTCHours(5, 30, 0, 0);
    const apt = await bookAppointment(db, {
      clinicId: a.clinic.id,
      patient: { phone: "+919876543214" },
      doctorId: doc.id,
      serviceId: svc.id,
      startsAt: future,
      source: "dashboard",
      allowOutsideRules: true,
    });
    await expect(
      setAppointmentOutcome(db, {
        clinicId: a.clinic.id,
        appointmentId: apt.id,
        status: "completed",
        actorUserId: a.user.id,
      }),
    ).rejects.toMatchObject({ code: "conflict" });
  });
});
