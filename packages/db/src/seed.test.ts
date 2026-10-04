import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import pg from "pg";
import { BULBUL_V3_SPEAKERS, LANGUAGE_CODES } from "@muxaris/shared";
import { createDb } from "./client.js";
import { schema } from "./index.js";
import { seedDemoClinic } from "./seed-data.js";

const url = process.env.DATABASE_URL ?? "postgres://muxaris:muxaris@localhost:5433/muxaris";
const { db, pool } = createDb(url);

async function dbReachable(): Promise<boolean> {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

const reachable = await dbReachable();
if (!reachable) {
  console.warn(
    "WARNING: Postgres unreachable, skipping db seed tests. Run: docker compose up -d && npm run db:migrate",
  );
}

afterAll(async () => {
  await pool.end();
});

(reachable ? describe : describe.skip)("seedDemoClinic", () => {
  beforeAll(async () => {
    await seedDemoClinic(db);
  });
  it("is idempotent", async () => {
    await seedDemoClinic(db);
    const docs = await db
      .select()
      .from(schema.doctors)
      .where(eq(schema.doctors.clinicId, "cl_demo_sunrise"));
    expect(docs).toHaveLength(2);
    const svcs = await db
      .select()
      .from(schema.services)
      .where(eq(schema.services.clinicId, "cl_demo_sunrise"));
    expect(svcs.length).toBeGreaterThanOrEqual(6);
  });
  it("creates working hours Mon–Sat 10:00–20:00 for both doctors", async () => {
    const rows = await db
      .select()
      .from(schema.workingHours)
      .where(eq(schema.workingHours.clinicId, "cl_demo_sunrise"));
    expect(rows).toHaveLength(12);
    expect(rows.every((r) => r.weekday >= 1 && r.weekday <= 6)).toBe(true);
  });
  it("creates both plans", async () => {
    const rows = await db.select().from(schema.plans);
    const ids = rows.map((p) => p.id);
    expect(ids).toContain("pilot");
    expect(ids).toContain("standard");
  });
  it("has greetings and bulbul:v3 voices for exactly the supported languages", async () => {
    const [profile] = await db
      .select()
      .from(schema.assistantProfiles)
      .where(eq(schema.assistantProfiles.clinicId, "cl_demo_sunrise"));
    const codes = [...LANGUAGE_CODES].sort();
    expect(Object.keys(profile!.voices).sort()).toEqual(codes);
    expect(Object.keys(profile!.greeting).sort()).toEqual(codes);
    for (const v of Object.values(profile!.voices)) expect(BULBUL_V3_SPEAKERS).toContain(v);
  });
});
