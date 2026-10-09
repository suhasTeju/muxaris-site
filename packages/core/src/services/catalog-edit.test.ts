import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { schema } from "@muxaris/db";
import { updateClinicProfile } from "./clinics.js";
import { createDoctor, createService, updateDoctor, updateService } from "./scheduling.js";
import { CoreError } from "./errors.js";
import { dbReachable, makeTestClinic, openDb, warnIfUnreachable } from "./test-support.js";

const { db, pool } = openDb();
const reachable = await dbReachable();
warnIfUnreachable(reachable, "core catalog edit tests");

const audits = (entityId: string) =>
  db
    .select()
    .from(schema.auditLog)
    .where(and(eq(schema.auditLog.entityId, entityId)));

(reachable ? describe : describe.skip)("catalog edits (settings)", () => {
  let a: Awaited<ReturnType<typeof makeTestClinic>>;
  let b: Awaited<ReturnType<typeof makeTestClinic>>;

  beforeAll(async () => {
    a = await makeTestClinic(db, "edit-a");
    b = await makeTestClinic(db, "edit-b");
  });
  afterAll(async () => {
    if (reachable) {
      await a?.cleanup();
      await b?.cleanup();
    }
    await pool.end();
  });

  it("updateDoctor changes only the given fields and audits the keys", async () => {
    const doc = await createDoctor(db, a.clinic.id, { name: "Dr. Rao", title: "BDS" });
    const row = await updateDoctor(db, {
      clinicId: a.clinic.id,
      doctorId: doc.id,
      actorUserId: a.user.id,
      patch: { name: "  Dr. Meera Rao ", specialties: ["General Dentistry"], active: false },
    });
    expect(row).toMatchObject({ name: "Dr. Meera Rao", title: "BDS", active: false });
    expect(row.specialties).toEqual(["General Dentistry"]);
    const [log] = await audits(doc.id);
    expect(log).toMatchObject({ action: "doctor.edit", actorId: a.user.id });
    expect(log!.data).toEqual({ keys: ["name", "specialties", "active"] });
  });

  it("updateDoctor refuses another clinic's doctor and an empty patch", async () => {
    const doc = await createDoctor(db, a.clinic.id, { name: "Dr. Shetty" });
    await expect(
      updateDoctor(db, {
        clinicId: b.clinic.id,
        doctorId: doc.id,
        actorUserId: b.user.id,
        patch: { active: false },
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      updateDoctor(db, {
        clinicId: a.clinic.id,
        doctorId: doc.id,
        actorUserId: a.user.id,
        patch: {},
      }),
    ).rejects.toBeInstanceOf(CoreError);
  });

  it("updateService edits and deactivates in place, never across clinics", async () => {
    const svc = await createService(db, a.clinic.id, { name: "Filling", durationMin: 45 });
    const row = await updateService(db, {
      clinicId: a.clinic.id,
      serviceId: svc.id,
      actorUserId: a.user.id,
      patch: { durationMin: 40, priceInr: 2000, active: false },
    });
    expect(row).toMatchObject({ durationMin: 40, priceInr: 2000, active: false, name: "Filling" });
    const [log] = await audits(svc.id);
    expect(log).toMatchObject({ action: "service.edit" });
    await expect(
      updateService(db, {
        clinicId: b.clinic.id,
        serviceId: svc.id,
        actorUserId: b.user.id,
        patch: { active: true },
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("updateClinicProfile edits the details and leaves settings alone", async () => {
    const row = await updateClinicProfile(db, {
      clinicId: a.clinic.id,
      actorUserId: a.user.id,
      patch: { city: "Mysuru", address: "  ", languages: ["en-IN", "kn-IN"] },
    });
    expect(row).toMatchObject({ city: "Mysuru", address: null, languages: ["en-IN", "kn-IN"] });
    expect(row.settings).toEqual(a.clinic.settings);
    const [log] = await audits(a.clinic.id);
    expect(log).toMatchObject({ action: "clinic.edit" });
    expect(log!.data).toEqual({ keys: ["city", "address", "languages"] });
    await expect(
      updateClinicProfile(db, {
        clinicId: a.clinic.id,
        actorUserId: a.user.id,
        patch: { languages: [] },
      }),
    ).rejects.toMatchObject({ code: "validation" });
  });
});
