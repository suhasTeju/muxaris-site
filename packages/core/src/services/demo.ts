import { eq } from "drizzle-orm";
import { schema, newId, DEMO_CLINIC_DEFINITION as DEF, type Db } from "@muxaris/db";

import { CoreError } from "./errors.js";

const { doctors, workingHours, services, slotRules, assistantProfiles } = schema;

/** Copies the Sunrise demo data into an existing clinic with fresh ids. No-op if it already has doctors. */
export async function loadDemoClinicData(db: Db, clinicId: string): Promise<void> {
  await db.transaction(async (tx) => {
    // Serialise concurrent loads for the same clinic.
    const [clinic] = await tx
      .select({ id: schema.clinics.id })
      .from(schema.clinics)
      .where(eq(schema.clinics.id, clinicId))
      .for("update");
    if (!clinic) throw new CoreError("not_found", "clinic not found");
    const existing = await tx
      .select({ id: doctors.id })
      .from(doctors)
      .where(eq(doctors.clinicId, clinicId))
      .limit(1);
    if (existing.length > 0) return;

    const docIds = new Map<string, string>();
    await tx.insert(doctors).values(
      DEF.doctors.map(({ key, ...d }) => {
        const id = newId("doc");
        docIds.set(key, id);
        return { ...d, id, clinicId };
      }),
    );
    const wh = DEF.workingHours;
    await tx.insert(workingHours).values(
      DEF.doctors.flatMap((d) =>
        wh.weekdays.map((weekday) => ({
          id: newId("wh"),
          clinicId,
          doctorId: docIds.get(d.key)!,
          weekday,
          startTime: wh.startTime,
          endTime: wh.endTime,
        })),
      ),
    );
    await tx
      .insert(services)
      .values(DEF.services.map(({ key: _key, ...v }) => ({ ...v, id: newId("svc"), clinicId })));
    await tx
      .insert(slotRules)
      .values({ ...DEF.slotRules, clinicId })
      .onConflictDoUpdate({ target: slotRules.clinicId, set: { ...DEF.slotRules } });
    await tx
      .insert(assistantProfiles)
      .values({ ...DEF.assistant, clinicId })
      .onConflictDoUpdate({ target: assistantProfiles.clinicId, set: { ...DEF.assistant } });
  });
}
