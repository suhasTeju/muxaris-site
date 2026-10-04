import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@muxaris/db";
import { loadDemoClinicData } from "./demo.js";
import { findPatientByPhone, listUpcomingForPatient, upsertPatientByPhone } from "./patients.js";
import { appendTurn, createCall, createCallback, finishCall } from "./calls.js";
import { bookAppointment, listDoctors, listServices } from "./scheduling.js";
import { dbReachable, makeTestClinic, openDb, warnIfUnreachable } from "./test-support.js";

const { db, pool } = openDb();
const reachable = await dbReachable();
warnIfUnreachable(reachable, "core demo/patient/call tests");

(reachable ? describe : describe.skip)("demo, patients and calls", () => {
  let a: Awaited<ReturnType<typeof makeTestClinic>>;
  let b: Awaited<ReturnType<typeof makeTestClinic>>;
  beforeAll(async () => {
    a = await makeTestClinic(db, "misc-a");
    b = await makeTestClinic(db, "misc-b");
  });
  afterAll(async () => {
    await a?.cleanup();
    await b?.cleanup();
    await pool.end();
  });

  it("loadDemoClinicData copies the demo with fresh ids and is idempotent", async () => {
    await loadDemoClinicData(db, a.clinic.id);
    await loadDemoClinicData(db, a.clinic.id);
    const docs = await listDoctors(db, a.clinic.id);
    const svcs = await listServices(db, a.clinic.id);
    expect(docs).toHaveLength(2);
    expect(svcs).toHaveLength(6);
    expect(docs.every((d) => !d.id.startsWith("doc_demo"))).toBe(true);
    const hours = await db
      .select()
      .from(schema.workingHours)
      .where(eq(schema.workingHours.clinicId, a.clinic.id));
    expect(hours).toHaveLength(12);
    await expect(loadDemoClinicData(db, "cl_missing")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("upserts patients by (clinic, phone) without cross-clinic leakage", async () => {
    const p1 = await upsertPatientByPhone(db, a.clinic.id, { phone: "+919811111111" });
    const p2 = await upsertPatientByPhone(db, a.clinic.id, {
      phone: "+919811111111",
      name: "Ravi",
      preferredLanguage: "kn-IN",
    });
    expect(p2.id).toBe(p1.id);
    expect(p2.name).toBe("Ravi");
    const p3 = await upsertPatientByPhone(db, a.clinic.id, { phone: "+919811111111" });
    expect(p3.name).toBe("Ravi");
    expect(await findPatientByPhone(db, b.clinic.id, "+919811111111")).toBeNull();
    expect((await findPatientByPhone(db, a.clinic.id, "+919811111111"))?.id).toBe(p1.id);
  });

  it("lists upcoming appointments for a patient", async () => {
    const [doc] = await listDoctors(db, a.clinic.id);
    const [svc] = await listServices(db, a.clinic.id);
    const startsAt = new Date(Date.now() + 3 * 86_400_000);
    startsAt.setUTCMinutes(0, 0, 0);
    const apt = await bookAppointment(db, {
      clinicId: a.clinic.id,
      patient: { phone: "+919822222222" },
      doctorId: doc!.id,
      serviceId: svc!.id,
      startsAt,
      source: "dashboard",
    });
    const up = await listUpcomingForPatient(db, a.clinic.id, apt.patientId);
    expect(up.map((x) => x.id)).toEqual([apt.id]);
    expect(await listUpcomingForPatient(db, b.clinic.id, apt.patientId)).toEqual([]);
  });

  it("records calls, turns and callbacks scoped to the clinic", async () => {
    const call = await createCall(db, {
      clinicId: a.clinic.id,
      channel: "browser",
      startedByUserId: a.user.id,
    });
    await appendTurn(db, {
      callId: call.id,
      clinicId: a.clinic.id,
      seq: 1,
      role: "user",
      text: "hi",
    });
    await expect(
      appendTurn(db, { callId: call.id, clinicId: a.clinic.id, seq: 1, role: "user", text: "dup" }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      appendTurn(db, { callId: call.id, clinicId: b.clinic.id, seq: 2, role: "user", text: "x" }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      finishCall(db, { callId: call.id, clinicId: b.clinic.id, status: "completed", durationS: 5 }),
    ).rejects.toMatchObject({ code: "not_found" });
    const done = await finishCall(db, {
      callId: call.id,
      clinicId: a.clinic.id,
      status: "completed",
      outcome: "booked",
      durationS: 42,
      languageDetected: "hi-IN",
      metrics: { ttfb: 700 },
    });
    expect(done.status).toBe("completed");
    expect(done.endedAt).not.toBeNull();
    const cb = await createCallback(db, {
      clinicId: a.clinic.id,
      callId: call.id,
      phone: "+919833333333",
      reason: "wants a quote",
    });
    expect(cb.status).toBe("open");
    await expect(
      createCallback(db, {
        clinicId: b.clinic.id,
        callId: call.id,
        phone: "+919833333333",
        reason: "x",
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});
