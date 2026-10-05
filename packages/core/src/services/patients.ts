import { and, asc, count, desc, eq, gte, ilike, inArray, or } from "drizzle-orm";
import { schema, newId, type Db } from "@muxaris/db";
import { maskPhone } from "@muxaris/shared";
import type { DbLike } from "./db-types.js";
import type { CallRow } from "./calls.js";
import type { Appointment } from "./scheduling.js";
import { CoreError } from "./errors.js";

const { patients, appointments, calls, auditLog } = schema;

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

export type PatientRow = typeof patients.$inferSelect;
/** Patient as exposed by core reads: the raw phone never leaves this module. */
export type PatientView = Omit<PatientRow, "phone"> & { phoneMasked: string };
export function toPatientView(row: PatientRow): PatientView {
  const { phone, ...rest } = row;
  return { ...rest, phoneMasked: maskPhone(phone) };
}

export interface PatientPatch {
  name?: string | null;
  email?: string | null;
  preferredLanguage?: string;
  dob?: string | null;
  notes?: string | null;
}

function normaliseFullIndianMobile(q: string): string | null {
  const m = /^(?:\+?91|0)?([6-9]\d{9})$/.exec(q.replace(/[\s-]/g, ""));
  return m ? `+91${m[1]}` : null;
}

export async function listPatients(
  db: Db,
  clinicId: string,
  opts: { q?: string; limit: number; offset: number },
): Promise<{ patients: PatientView[]; total: number }> {
  const q = opts.q?.trim();
  const like = q ? `%${q.replace(/[\\%_]/g, "\\$&")}%` : null;
  // Phones match only as a complete number, so partial digits cannot reconstruct one unaudited.
  const fullPhone = q ? normaliseFullIndianMobile(q) : null;
  const where = and(
    eq(patients.clinicId, clinicId),
    like
      ? or(
          ilike(patients.name, like),
          ilike(patients.email, like),
          fullPhone ? eq(patients.phone, fullPhone) : undefined,
        )
      : undefined,
  );
  const [rows, [tot]] = await Promise.all([
    db
      .select()
      .from(patients)
      .where(where)
      .orderBy(desc(patients.createdAt), desc(patients.id))
      .limit(opts.limit)
      .offset(opts.offset),
    db.select({ n: count() }).from(patients).where(where),
  ]);
  return { patients: rows.map(toPatientView), total: Number(tot?.n ?? 0) };
}

async function loadPatient(db: DbLike, clinicId: string, patientId: string): Promise<PatientRow> {
  const [row] = await db
    .select()
    .from(patients)
    .where(and(eq(patients.id, patientId), eq(patients.clinicId, clinicId)));
  if (!row) throw new CoreError("not_found", "patient not found");
  return row;
}

/** Call history entry for a patient; deliberately omits the caller's raw phone. */
export interface PatientCallSummary {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  durationS: number | null;
  outcome: CallRow["outcome"];
  summary: string | null;
}

export async function getPatient(
  db: Db,
  clinicId: string,
  patientId: string,
): Promise<{ patient: PatientView; appointments: Appointment[]; calls: PatientCallSummary[] }> {
  const row = await loadPatient(db, clinicId, patientId);
  const [apts, callRows] = await Promise.all([
    db
      .select()
      .from(appointments)
      .where(and(eq(appointments.clinicId, clinicId), eq(appointments.patientId, patientId)))
      .orderBy(desc(appointments.startsAt))
      .limit(100),
    db
      .select({
        id: calls.id,
        startedAt: calls.startedAt,
        endedAt: calls.endedAt,
        durationS: calls.durationS,
        outcome: calls.outcome,
        summary: calls.summary,
      })
      .from(calls)
      .where(and(eq(calls.clinicId, clinicId), eq(calls.patientId, patientId)))
      .orderBy(desc(calls.startedAt))
      .limit(50),
  ]);
  return { patient: toPatientView(row), appointments: apts, calls: callRows };
}

export async function createPatient(
  db: Db,
  clinicId: string,
  input: PatientInput & Omit<PatientPatch, "name" | "preferredLanguage">,
): Promise<PatientView> {
  const phone = input.phone.trim();
  if (!phone) throw new CoreError("validation", "patient phone is required");
  const existing = await findPatientByPhone(db, clinicId, phone);
  if (existing) throw new CoreError("conflict", "a patient with this phone already exists");
  const [row] = await db
    .insert(patients)
    .values({
      id: newId("pat"),
      clinicId,
      phone,
      name: input.name?.trim() || null,
      email: input.email?.trim() || null,
      dob: input.dob ?? null,
      notes: input.notes ?? null,
      ...(input.preferredLanguage ? { preferredLanguage: input.preferredLanguage } : {}),
    })
    .returning();
  return toPatientView(row!);
}

export async function updatePatient(
  db: Db,
  clinicId: string,
  patientId: string,
  patch: PatientPatch,
): Promise<PatientView> {
  await loadPatient(db, clinicId, patientId);
  const [row] = await db
    .update(patients)
    .set({
      ...(patch.name !== undefined ? { name: patch.name?.trim() || null } : {}),
      ...(patch.email !== undefined ? { email: patch.email?.trim() || null } : {}),
      ...(patch.preferredLanguage ? { preferredLanguage: patch.preferredLanguage } : {}),
      ...(patch.dob !== undefined ? { dob: patch.dob } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(patients.id, patientId), eq(patients.clinicId, clinicId)))
    .returning();
  return toPatientView(row!);
}

/** The only path that returns a raw patient phone. Every call is audited (no number in the row). */
export async function revealPatientPhone(
  db: Db,
  input: { clinicId: string; patientId: string; actorUserId: string },
): Promise<{ phone: string }> {
  const row = await loadPatient(db, input.clinicId, input.patientId);
  await db.insert(auditLog).values({
    id: newId("aud"),
    clinicId: input.clinicId,
    actorId: input.actorUserId,
    action: "patient.phone.reveal",
    entity: "patient",
    entityId: input.patientId,
    data: {},
  });
  return { phone: row.phone };
}
