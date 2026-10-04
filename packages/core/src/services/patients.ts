import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { schema, newId, type Db } from "@muxaris/db";
import type { DbLike } from "./db-types.js";
import { CoreError } from "./errors.js";

const { patients, appointments } = schema;

export interface PatientInput {
  phone: string;
  name?: string;
  preferredLanguage?: string;
}

export async function upsertPatientByPhone(db: DbLike, clinicId: string, input: PatientInput) {
  const phone = input.phone?.trim();
  if (!phone) throw new CoreError("validation", "patient phone is required");
  const name = input.name?.trim() || undefined;
  const [row] = await db
    .insert(patients)
    .values({
      id: newId("pat"),
      clinicId,
      phone,
      name: name ?? null,
      ...(input.preferredLanguage ? { preferredLanguage: input.preferredLanguage } : {}),
    })
    .onConflictDoUpdate({
      target: [patients.clinicId, patients.phone],
      set: {
        ...(name ? { name } : {}),
        ...(input.preferredLanguage ? { preferredLanguage: input.preferredLanguage } : {}),
        // ensures RETURNING yields the row even when there is nothing to change
        phone,
      },
    })
    .returning();
  return row!;
}

export async function findPatientByPhone(db: Db, clinicId: string, phone: string) {
  const [row] = await db
    .select()
    .from(patients)
    .where(and(eq(patients.clinicId, clinicId), eq(patients.phone, phone.trim())));
  return row ?? null;
}

export async function listUpcomingForPatient(
  db: Db,
  clinicId: string,
  patientId: string,
  now: Date = new Date(),
) {
  return db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.clinicId, clinicId),
        eq(appointments.patientId, patientId),
        gte(appointments.startsAt, now),
        inArray(appointments.status, ["scheduled", "confirmed", "rescheduled"]),
      ),
    )
    .orderBy(asc(appointments.startsAt));
}
