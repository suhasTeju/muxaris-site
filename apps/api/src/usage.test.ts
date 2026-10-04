import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import pg from "pg";
import { createDb, schema, newId } from "@muxaris/db";
import { createDevVerifier } from "@muxaris/core";
import { createApp } from "./app.js";
import { monthInTimezone } from "./routes/me.js";

describe("monthInTimezone", () => {
  it("uses the clinic timezone at a month boundary", () => {
    const at = new Date("2026-09-30T20:00:00Z"); // 01:30 IST on Oct 1
    expect(monthInTimezone(at, "Asia/Kolkata")).toBe("2026-10");
    expect(monthInTimezone(at, "UTC")).toBe("2026-09");
  });
  it("falls back to Asia/Kolkata for an invalid zone", () => {
    expect(monthInTimezone(new Date("2026-09-30T20:00:00Z"), "Not/AZone")).toBe("2026-10");
  });
});

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
if (!reachable) console.warn("WARNING: Postgres unreachable, skipping GET /v1/usage tests.");

const run = newId("t").slice(-8).toLowerCase();
const sub = `sub-usage-${run}`;
const tok = `dev:${sub}:usage-${run}@test.example`;
const app = createApp({ version: "test", db, verifier: createDevVerifier() });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
const req = (path: string, clinic?: string, token: string | undefined = tok) =>
  app.request(`/v1${path}`, {
    method: path === "/clinics" ? "POST" : "GET",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(clinic ? { "X-Clinic-Id": clinic } : {}),
      ...(path === "/clinics" ? { "Content-Type": "application/json" } : {}),
    },
    ...(path === "/clinics"
      ? { body: JSON.stringify({ name: `Usage ${run}`, city: "Mysuru" }) }
      : {}),
  });

let clinicId = "";
afterAll(async () => {
  if (reachable) {
    if (clinicId) await db.delete(schema.clinics).where(eq(schema.clinics.id, clinicId));
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

(reachable ? describe : describe.skip)("GET /v1/usage", () => {
  it("requires auth and a clinic membership", async () => {
    expect((await req("/usage", undefined, "")).status).toBe(401);
    expect((await req("/usage")).status).toBe(403);
  });

  it("returns zeros with plan allowance when no ledger row exists, then the month's totals", async () => {
    clinicId = (((await (await req("/clinics")).json()) as J).clinic as J).id;
    const first = (await (await req("/usage", clinicId)).json()) as J;
    expect(first).toMatchObject({ callSeconds: 0, calls: 0, plan: "pilot" });
    expect(first.month).toMatch(/^\d{4}-\d{2}$/);
    expect(first.includedCallMinutes).toBeGreaterThanOrEqual(0);

    await db
      .insert(schema.usageLedger)
      .values({ clinicId, month: first.month, callSeconds: 750, calls: 3 });
    const second = (await (await req("/usage", clinicId)).json()) as J;
    expect(second).toMatchObject({ month: first.month, callSeconds: 750, calls: 3 });
  });
});
