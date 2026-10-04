import { and, asc, eq, sql } from "drizzle-orm";
import { schema, newId, type Db } from "@muxaris/db";
import { CoreError } from "./errors.js";

const {
  clinics,
  users,
  memberships,
  slotRules,
  assistantProfiles,
  doctors,
  services,
  workingHours,
  clinicHolidays,
} = schema;

export function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "clinic";
}

function isUniqueViolation(e: unknown): boolean {
  const code = (e as { code?: string; cause?: { code?: string } })?.code;
  return code === "23505" || (e as { cause?: { code?: string } })?.cause?.code === "23505";
}

export interface CreateClinicInput {
  userId: string;
  name: string;
  specialty: string;
  city: string;
  timezone?: string;
  languages?: string[];
  address?: string;
  phone?: string;
}

/**
 * Max clinics one user may own. Phase 1 has no generic write rate limiter by design (the
 * Phase 5 WAF covers abuse); this cap is the only per-user guard on clinic creation.
 */
export const MAX_CLINICS_PER_USER = 5;

export async function createClinicForUser(db: Db, input: CreateClinicInput) {
  const name = input.name?.trim();
  if (!name) throw new CoreError("validation", "clinic name is required");
  if (!input.city?.trim()) throw new CoreError("validation", "city is required");
  return db.transaction(async (tx) => {
    // Serialise per user so concurrent creates cannot slip past the cap.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).for("update");
    const [{ owned } = { owned: 0 }] = await tx
      .select({ owned: sql<number>`count(*)::int` })
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, input.userId),
          eq(memberships.role, "owner"),
          eq(memberships.status, "active"),
        ),
      );
    if (owned >= MAX_CLINICS_PER_USER) {
      throw new CoreError("clinic_limit", `you can own at most ${MAX_CLINICS_PER_USER} clinics`);
    }
    const base = slugify(name);
    let slug = base;
    let n = 1;
    let clinic: typeof clinics.$inferSelect | undefined;
    for (let attempt = 0; attempt < 5 && !clinic; attempt++) {
      for (; ; n++) {
        slug = n === 1 ? base : `${base}-${n}`;
        const [hit] = await tx
          .select({ id: clinics.id })
          .from(clinics)
          .where(eq(clinics.slug, slug));
        if (!hit) break;
      }
      // savepoint so a unique violation does not abort the outer transaction
      try {
        [clinic] = await tx.transaction((sp) =>
          sp
            .insert(clinics)
            .values({
              id: newId("cl"),
              name,
              slug,
              specialty: input.specialty,
              city: input.city.trim(),
              ...(input.address ? { address: input.address } : {}),
              ...(input.phone ? { phone: input.phone } : {}),
              ...(input.timezone ? { timezone: input.timezone } : {}),
              ...(input.languages?.length ? { languages: input.languages } : {}),
            })
            .returning(),
        );
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
        n++;
      }
    }
    if (!clinic) throw new CoreError("conflict", "could not allocate a unique clinic slug");
    const [membership] = await tx
      .insert(memberships)
      .values({ id: newId("mem"), userId: input.userId, clinicId: clinic.id, role: "owner" })
      .returning();
    await tx.insert(slotRules).values({ clinicId: clinic.id });
    await tx.insert(assistantProfiles).values({ clinicId: clinic.id });
    return { clinic, membership: membership! };
  });
}

export async function getUserByCognitoSub(db: Db, sub: string) {
  const [row] = await db.select().from(users).where(eq(users.cognitoSub, sub));
  return row ?? null;
}

/**
 * Identity is keyed on `cognitoSub` only (never matched or merged by email). When `email` is
 * undefined (e.g. unverified) the stored email is kept; a brand-new user then needs one.
 */
export async function upsertUser(
  db: Db,
  input: { cognitoSub: string; email?: string | undefined; name?: string },
) {
  if (!input.email) {
    const existing = await getUserByCognitoSub(db, input.cognitoSub);
    if (!existing) throw new CoreError("validation", "a verified email is required");
    if (input.name && input.name !== existing.name) {
      const [row] = await db
        .update(users)
        .set({ name: input.name })
        .where(eq(users.cognitoSub, input.cognitoSub))
        .returning();
      return row!;
    }
    return existing;
  }
  try {
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
  } catch (e) {
    if (isUniqueViolation(e))
      throw new CoreError(
        "conflict",
        "this email is already registered with a different sign-in method",
      );
    throw e;
  }
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
  const hours = await db.select().from(workingHours).where(eq(workingHours.clinicId, clinicId));
  const svcs = await db
    .select()
    .from(services)
    .where(and(eq(services.clinicId, clinicId), eq(services.active, true)));
  const holidays = await db
    .select({ date: clinicHolidays.date, name: clinicHolidays.name })
    .from(clinicHolidays)
    .where(eq(clinicHolidays.clinicId, clinicId))
    .orderBy(asc(clinicHolidays.date));
  return {
    clinic,
    slotRules: rules ?? null,
    assistant: assistant ?? null,
    doctors: docs.map((d) => ({
      ...d,
      workingHours: hours
        .filter((h) => h.doctorId === d.id)
        .map((h) => ({
          weekday: h.weekday,
          startTime: h.startTime.slice(0, 5),
          endTime: h.endTime.slice(0, 5),
        }))
        .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime)),
    })),
    services: svcs,
    holidays,
  };
}
