import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import pg from "pg";
import { createDb, schema, newId } from "@muxaris/db";
import { createDevVerifier } from "@muxaris/core";
import { createApp } from "../app.js";

const url = process.env.DATABASE_URL ?? "postgres://muxaris:muxaris@localhost:5433/muxaris";
const { db, pool } = createDb(url);
async function dbReachable() {
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
if (!reachable) console.warn("WARNING: Postgres unreachable, skipping me route tests.");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
const run = newId("t").slice(-8).toLowerCase();
const subs = [`m-own-${run}`, `m-fd-${run}`, `m-out-${run}`];
const tok = (sub: string) => `dev:${sub}:${sub}@test.example`;
const app = createApp({ version: "test", db, verifier: createDevVerifier() });
const clinicIds: string[] = [];

const call = (method: string, path: string, token: string, body?: unknown) =>
  app.request(`/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

afterAll(async () => {
  if (reachable) {
    if (clinicIds.length) {
      await db.delete(schema.clinics).where(inArray(schema.clinics.id, clinicIds));
    }
    await db.delete(schema.users).where(inArray(schema.users.cognitoSub, subs));
  }
  await pool.end();
});

describe.skipIf(!reachable)("PATCH /clinics/:id (settings)", () => {
  it("owner can set recordCalls; front_desk and non-members are refused", async () => {
    const created = await call("POST", "/clinics", tok(subs[0]!), {
      name: `Settings ${run}`,
      city: "Bengaluru",
    });
    expect(created.status).toBe(201);
    const clinic = ((await created.json()) as J).clinic.id as string;
    clinicIds.push(clinic);

    await call("GET", "/me", tok(subs[1]!));
    await call("GET", "/me", tok(subs[2]!));
    const [u] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.cognitoSub, subs[1]!));
    await db
      .insert(schema.memberships)
      .values({ id: newId("mem"), userId: u!.id, clinicId: clinic, role: "front_desk" });

    const body = { settings: { recordCalls: false } };
    const ok = await call("PATCH", `/clinics/${clinic}`, tok(subs[0]!), body);
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as J).clinic.settings.recordCalls).toBe(false);
    const [row] = await db.select().from(schema.clinics).where(eq(schema.clinics.id, clinic));
    expect(row!.settings["recordCalls"]).toBe(false);

    const fd = await call("PATCH", `/clinics/${clinic}`, tok(subs[1]!), {
      settings: { recordCalls: true },
    });
    expect(fd.status).toBe(403);
    expect(((await fd.json()) as J).error.code).toBe("owner_required");

    const out = await call("PATCH", `/clinics/${clinic}`, tok(subs[2]!), body);
    expect(out.status).toBe(403);
    expect(((await out.json()) as J).error.code).toBe("forbidden");

    const [still] = await db.select().from(schema.clinics).where(eq(schema.clinics.id, clinic));
    expect(still!.settings["recordCalls"]).toBe(false);
  });
});
