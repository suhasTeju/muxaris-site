import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import pg from "pg";
import { createDb, schema, newId } from "@muxaris/db";
import { createDevVerifier } from "@muxaris/core";
import { createApp } from "../app.js";

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
if (!reachable) console.warn("WARNING: Postgres unreachable, skipping analytics route tests.");

const run = newId("t").slice(-8).toLowerCase();
const sub = `sub-analytics-${run}`;
const tok = `dev:${sub}:analytics-${run}@test.example`;
const app = createApp({ version: "test", db, verifier: createDevVerifier() });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
const req = (path: string, clinic?: string) =>
  app.request(`/v1${path}`, {
    headers: { Authorization: `Bearer ${tok}`, ...(clinic ? { "X-Clinic-Id": clinic } : {}) },
  });
const createClinic = async (name: string): Promise<string> => {
  const res = await app.request("/v1/clinics", {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, city: "Mysuru" }),
  });
  return ((await res.json()) as J).clinic.id as string;
};

let clinicId = "";
let otherId = "";
beforeAll(async () => {
  if (!reachable) return;
  clinicId = await createClinic(`Analytics ${run}`);
  otherId = await createClinic(`Analytics other ${run}`);
  await db.insert(schema.calls).values([
    {
      id: newId("call"),
      clinicId,
      channel: "browser",
      startedAt: new Date("2026-09-10T05:00:00Z"),
      endedAt: new Date("2026-09-10T05:02:00Z"),
      durationS: 120,
      status: "completed",
      outcome: "booked",
    },
    {
      id: newId("call"),
      clinicId,
      channel: "phone",
      startedAt: new Date("2026-09-12T06:00:00Z"),
      endedAt: new Date("2026-09-12T06:01:00Z"),
      durationS: 60,
      status: "completed",
      outcome: "info",
    },
  ]);
});
afterAll(async () => {
  if (reachable) {
    for (const id of [clinicId, otherId].filter(Boolean))
      await db.delete(schema.clinics).where(eq(schema.clinics.id, id));
    const users = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.cognitoSub, sub));
    if (users.length) {
      const ids = users.map((u) => u.id);
      await db.delete(schema.memberships).where(inArray(schema.memberships.userId, ids));
      await db.delete(schema.users).where(inArray(schema.users.id, ids));
    }
  }
  await pool.end();
});

(reachable ? describe : describe.skip)("analytics and usage routes", () => {
  it("returns analytics for a range and rejects inverted and oversized ranges", async () => {
    const ok = await req(`/analytics/calls?from=2026-09-01&to=2026-09-30`, clinicId);
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as J;
    expect(body.byDay).toHaveLength(30);
    expect(body.byHour).toHaveLength(24);
    expect(body.totalCalls).toBe(2);
    expect((await req(`/analytics/calls?from=2026-09-30&to=2026-09-01`, clinicId)).status).toBe(
      400,
    );
    expect((await req(`/analytics/calls?from=2026-01-01&to=2026-06-30`, clinicId)).status).toBe(
      400,
    );
    expect((await req(`/analytics/calls?from=2026-09-01`, clinicId)).status).toBe(400);
  });

  it("returns zero-filled monthly usage and the usage summary with plan facts", async () => {
    const m = await req(`/analytics/usage?months=3`, clinicId);
    expect(m.status).toBe(200);
    expect(((await m.json()) as J).months).toHaveLength(3);
    expect((await req(`/analytics/usage?months=0`, clinicId)).status).toBe(400);
    const u = await req(`/usage`, clinicId);
    const body = (await u.json()) as J;
    expect(body).toMatchObject({
      plan: "pilot",
      planName: "Pilot",
      includedCallMinutes: 500,
      priceInrMonthly: 0,
      maxConcurrentCalls: 2,
      overageSeconds: 0,
      llmInputTokens: 0,
      llmOutputTokens: 0,
    });
    expect(typeof body.pilotEndsAt).toBe("string");
  });

  it("is scoped to the clinic header", async () => {
    const res = await req(`/analytics/calls?from=2026-09-01&to=2026-09-30`, otherId);
    expect(((await res.json()) as J).totalCalls).toBe(0);
  });

  it("requires auth and membership", async () => {
    expect((await req(`/analytics/calls?from=2026-09-01&to=2026-09-30`)).status).toBe(403);
  });
});
