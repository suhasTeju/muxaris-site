import { and, eq } from "drizzle-orm";
import { schema, newId, type Db } from "@muxaris/db";
import { CoreError } from "./errors.js";

const { clinics, users, memberships, slotRules, assistantProfiles, doctors, services } = schema;

export function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "clinic";
}

export interface CreateClinicInput {
  userId: string;
  name: string;
  specialty: string;
  city: string;
  timezone?: string;
  languages?: string[];
}

export async function createClinicForUser(db: Db, input: CreateClinicInput) {
  const name = input.name?.trim();
  if (!name) throw new CoreError("validation", "clinic name is required");
  if (!input.city?.trim()) throw new CoreError("validation", "city is required");
  return db.transaction(async (tx) => {
    const base = slugify(name);
    let slug = base;
    for (let n = 2; ; n++) {
      const [hit] = await tx.select({ id: clinics.id }).from(clinics).where(eq(clinics.slug, slug));
      if (!hit) break;
      slug = `${base}-${n}`;
    }
    const [clinic] = await tx
      .insert(clinics)
      .values({
        id: newId("cl"),
        name,
        slug,
        specialty: input.specialty,
        city: input.city.trim(),
        ...(input.timezone ? { timezone: input.timezone } : {}),
        ...(input.languages?.length ? { languages: input.languages } : {}),
      })
      .returning();
    const [membership] = await tx
      .insert(memberships)
      .values({ id: newId("mem"), userId: input.userId, clinicId: clinic!.id, role: "owner" })
      .returning();
    await tx.insert(slotRules).values({ clinicId: clinic!.id });
    await tx.insert(assistantProfiles).values({ clinicId: clinic!.id });
    return { clinic: clinic!, membership: membership! };
  });
}

export async function getUserByCognitoSub(db: Db, sub: string) {
  const [row] = await db.select().from(users).where(eq(users.cognitoSub, sub));
  return row ?? null;
}

export async function upsertUser(
  db: Db,
  input: { cognitoSub: string; email: string; name?: string },
) {
  const [row] = await db
    .insert(users)
    .values({
      id: newId("usr"),
      cognitoSub: input.cognitoSub,
      email: input.email,
      name: input.name ?? null,
    })
    .onConflictDoUpdate({
      target: users.cognitoSub,
      set: { email: input.email, ...(input.name ? { name: input.name } : {}) },
    })
    .returning();
  return row!;
}

export async function listMemberships(db: Db, userId: string) {
  return db
    .select({ clinic: clinics, role: memberships.role })
    .from(memberships)
    .innerJoin(clinics, eq(clinics.id, memberships.clinicId))
    .where(and(eq(memberships.userId, userId), eq(memberships.status, "active")));
}

export async function getMembership(db: Db, input: { userId: string; clinicId: string }) {
  const [row] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, input.userId),
        eq(memberships.clinicId, input.clinicId),
        eq(memberships.status, "active"),
      ),
    );
  return row ?? null;
}

export async function getClinicContext(db: Db, clinicId: string) {
  const [clinic] = await db.select().from(clinics).where(eq(clinics.id, clinicId));
  if (!clinic) throw new CoreError("not_found", "clinic not found");
  const [rules] = await db.select().from(slotRules).where(eq(slotRules.clinicId, clinicId));
  const [assistant] = await db
    .select()
    .from(assistantProfiles)
    .where(eq(assistantProfiles.clinicId, clinicId));
  const docs = await db
    .select()
    .from(doctors)
    .where(and(eq(doctors.clinicId, clinicId), eq(doctors.active, true)));
  const svcs = await db
    .select()
    .from(services)
    .where(and(eq(services.clinicId, clinicId), eq(services.active, true)));
  return {
    clinic,
    slotRules: rules ?? null,
    assistant: assistant ?? null,
    doctors: docs,
    services: svcs,
  };
}
