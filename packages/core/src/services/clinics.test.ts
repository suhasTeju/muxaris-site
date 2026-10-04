import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { newId, schema } from "@muxaris/db";
import {
  createClinicForUser,
  getClinicContext,
  getMembership,
  getUserByCognitoSub,
  listMemberships,
  slugify,
  upsertUser,
} from "./clinics.js";
import { CoreError } from "./errors.js";
import { MAX_CLINICS_PER_USER } from "./clinics.js";
import { createDoctor, setWorkingHours } from "./scheduling.js";
import { dbReachable, makeTestClinic, openDb, warnIfUnreachable } from "./test-support.js";

const { db, pool } = openDb();
const reachable = await dbReachable();
warnIfUnreachable(reachable, "core clinics tests");

describe("slugify", () => {
  it("lowercases, hyphenates and strips junk", () => {
    expect(slugify("  Sunrise  Dental & Care!! ")).toBe("sunrise-dental-care");
    expect(slugify("???")).toBe("clinic");
  });
});

(reachable ? describe : describe.skip)("clinic service", () => {
  let ctx: Awaited<ReturnType<typeof makeTestClinic>>;
  const extra: string[] = [];
  const extraUsers: string[] = [];
  beforeAll(async () => {
    ctx = await makeTestClinic(db, "clinics");
  });
  afterAll(async () => {
    for (const id of extra) await db.delete(schema.clinics).where(eq(schema.clinics.id, id));
    for (const id of extraUsers) await db.delete(schema.users).where(eq(schema.users.id, id));
    await ctx?.cleanup();
    await pool.end();
  });

  it("createClinicForUser creates owner membership and defaults", async () => {
    const { clinic } = ctx;
    const m = await getMembership(db, { userId: ctx.user.id, clinicId: clinic.id });
    expect(m).toEqual({ role: "owner" });
    const full = await getClinicContext(db, clinic.id);
    expect(full.slotRules?.slotGrainMin).toBe(15);
    expect(full.assistant?.name).toBe("Muxaris");
    expect(full.clinic.onboardingStep).toBe("basics");
    expect(clinic.timezone).toBe("Asia/Kolkata");
    const list = await listMemberships(db, ctx.user.id);
    expect(list.map((x) => x.clinic.id)).toContain(clinic.id);
  });

  it("appends -2, -3 on slug collision", async () => {
    const a = await createClinicForUser(db, {
      userId: ctx.user.id,
      name: "Slug Collision Clinic",
      specialty: "dental",
      city: "Pune",
    });
    const b = await createClinicForUser(db, {
      userId: ctx.user.id,
      name: "Slug Collision Clinic",
      specialty: "dental",
      city: "Pune",
    });
    const c = await createClinicForUser(db, {
      userId: ctx.user.id,
      name: "slug collision clinic!",
      specialty: "dental",
      city: "Pune",
    });
    extra.push(a.clinic.id, b.clinic.id, c.clinic.id);
    expect(b.clinic.slug).toBe(`${a.clinic.slug}-2`);
    expect(c.clinic.slug).toBe(`${a.clinic.slug}-3`);
  });

  it("getClinicContext includes doctor working hours and holidays", async () => {
    const doc = await createDoctor(db, ctx.clinic.id, { name: "Dr Ctx" });
    await setWorkingHours(db, ctx.clinic.id, doc.id, [
      { weekday: 3, startTime: "09:00", endTime: "13:00" },
      { weekday: 1, startTime: "10:00", endTime: "14:30" },
    ]);
    await db
      .insert(schema.clinicHolidays)
      .values({ id: newId("hol"), clinicId: ctx.clinic.id, date: "2026-12-25", name: "Christmas" });
    const full = await getClinicContext(db, ctx.clinic.id);
    const d = full.doctors.find((x) => x.id === doc.id)!;
    expect(d.workingHours).toEqual([
      { weekday: 1, startTime: "10:00", endTime: "14:30" },
      { weekday: 3, startTime: "09:00", endTime: "13:00" },
    ]);
    expect(full.holidays).toEqual([{ date: "2026-12-25", name: "Christmas" }]);
    expect(full.services).toEqual([]);
  });

  async function freshUser() {
    const tag = newId("usr");
    const [u] = await db
      .insert(schema.users)
      .values({ id: tag, cognitoSub: `fresh-${tag}`, email: `fresh-${tag}@x.test` })
      .returning();
    extraUsers.push(u!.id);
    return u!;
  }

  it("retries the slug on a unique violation from concurrent creates", async () => {
    // distinct users: the per-user lock would otherwise serialise the race away
    const users = await Promise.all([freshUser(), freshUser(), freshUser()]);
    const results = await Promise.all(
      users.map((u) =>
        createClinicForUser(db, {
          userId: u.id,
          name: "Racing Slug Clinic",
          specialty: "dental",
          city: "Pune",
        }),
      ),
    );
    extra.push(...results.map((r) => r.clinic.id));
    expect(new Set(results.map((r) => r.clinic.slug)).size).toBe(3);
  });

  it("skips taken slugs deterministically (-2 taken -> -3)", async () => {
    const owner = await freshUser();
    const mk = () =>
      createClinicForUser(db, {
        userId: owner.id,
        name: "Deterministic Slug Clinic",
        specialty: "dental",
        city: "Pune",
      });
    const first = await mk();
    const second = await mk();
    const third = await mk();
    extra.push(first.clinic.id, second.clinic.id, third.clinic.id);
    expect(second.clinic.slug).toBe(`${first.clinic.slug}-2`);
    expect(third.clinic.slug).toBe(`${first.clinic.slug}-3`);
  });

  it("upserts users by cognito sub", async () => {
    const u = await upsertUser(db, {
      cognitoSub: ctx.user.cognitoSub,
      email: ctx.user.email,
      name: "Dr Test",
    });
    expect(u.id).toBe(ctx.user.id);
    expect(u.name).toBe("Dr Test");
    expect((await getUserByCognitoSub(db, ctx.user.cognitoSub))?.id).toBe(ctx.user.id);
    expect(await getUserByCognitoSub(db, "nope")).toBeNull();
  });

  it("getClinicContext throws not_found for unknown clinic", async () => {
    await expect(getClinicContext(db, "cl_missing")).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(getClinicContext(db, "cl_missing")).rejects.toBeInstanceOf(CoreError);
  });

  it("caps owned clinics per user (clinic_limit)", async () => {
    const [u] = await db
      .insert(schema.users)
      .values({
        id: newId("usr"),
        cognitoSub: `cap-${newId("usr")}`,
        email: `cap-${newId("usr")}@x.test`,
      })
      .returning();
    const made: string[] = [];
    try {
      for (let i = 0; i < MAX_CLINICS_PER_USER; i++) {
        const { clinic } = await createClinicForUser(db, {
          userId: u!.id,
          name: `Cap Clinic ${i}`,
          specialty: "dental",
          city: "Pune",
        });
        made.push(clinic.id);
      }
      await expect(
        createClinicForUser(db, {
          userId: u!.id,
          name: "One Too Many",
          specialty: "dental",
          city: "Pune",
        }),
      ).rejects.toMatchObject({ code: "clinic_limit" });
    } finally {
      for (const id of made) await db.delete(schema.clinics).where(eq(schema.clinics.id, id));
      await db.delete(schema.users).where(eq(schema.users.id, u!.id));
    }
  });
});
