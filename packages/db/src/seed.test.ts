import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb } from "./client.js";
import { schema } from "./index.js";
import { seedDemoClinic } from "./seed-data.js";

const url = process.env.DATABASE_URL ?? "postgres://muxaris:muxaris@localhost:5433/muxaris";
const { db, pool } = createDb(url);

afterAll(async () => {
  await pool.end();
});

describe("seedDemoClinic", () => {
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
    expect(rows.map((p) => p.id).sort()).toEqual(["pilot", "standard"]);
  });
});
