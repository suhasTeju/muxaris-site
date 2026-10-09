import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import pg from "pg";
import { createDb, schema, newId } from "@muxaris/db";
import { createDevVerifier } from "@muxaris/core";
import { FakeBlobStore } from "@muxaris/storage/fakes";
import { dayWindow } from "./stats.js";
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
if (!reachable) console.warn("WARNING: Postgres unreachable, skipping stats tests.");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
const run = newId("t").slice(-8).toLowerCase();
const subs = [`stats-a-${run}`, `stats-b-${run}`];
const tok = (sub: string) => `dev:${sub}:${sub}@test.example`;
const blobs = new FakeBlobStore();
const app = createApp({ version: "test", db, verifier: createDevVerifier(), blobs });
const clinicIds: string[] = [];

const call = (method: string, path: string, o: { sub: string; clinic: string; body?: unknown }) =>
  app.request(`/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${tok(o.sub)}`,
      "X-Clinic-Id": o.clinic,
      ...(o.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(o.body !== undefined ? { body: JSON.stringify(o.body) } : {}),
  });

async function mkClinic(sub: string, name: string) {
  const res = await app.request("/v1/clinics", {
    method: "POST",
    headers: { Authorization: `Bearer ${tok(sub)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: `${name} ${run}`, city: "Pune" }),
  });
  expect(res.status).toBe(201);
  const id = ((await res.json()) as J).clinic.id as string;
  clinicIds.push(id);
  return id;
}

afterAll(async () => {
  if (reachable) {
    if (clinicIds.length) {
      await db.delete(schema.auditLog).where(inArray(schema.auditLog.clinicId, clinicIds));
      await db.delete(schema.clinics).where(inArray(schema.clinics.id, clinicIds));
    }
    await db.delete(schema.users).where(inArray(schema.users.cognitoSub, subs));
  }
  await pool.end();
});

const d = reachable ? describe : describe.skip;

describe("dayWindow", () => {
  it("builds the Asia/Kolkata day as +05:30", () => {
    const { dayStart, dayEnd } = dayWindow("2026-03-10", "Asia/Kolkata");
    expect(dayStart.toISOString()).toBe("2026-03-09T18:30:00.000Z");
    expect(dayEnd.toISOString()).toBe("2026-03-10T18:30:00.000Z");
  });
  it("handles UTC and negative offsets", () => {
    expect(dayWindow("2026-03-10", "UTC").dayStart.toISOString()).toBe("2026-03-10T00:00:00.000Z");
    expect(dayWindow("2026-01-10", "America/New_York").dayStart.toISOString()).toBe(
      "2026-01-10T05:00:00.000Z",
    );
  });
});

d("stats routes", () => {
  let a = "";
  beforeAll(async () => {
    a = await mkClinic(subs[0]!, "StatsA");
    const [cl] = await db.select().from(schema.clinics).where(eq(schema.clinics.id, a));
    expect(cl!.timezone).toBe("Asia/Kolkata");
    const mk = (startedAt: string, outcome: "booked" | "info", durationS: number) =>
      db.insert(schema.calls).values({
        id: newId("call"),
        clinicId: a,
        channel: "phone",
        startedAt: new Date(startedAt),
        endedAt: new Date(startedAt),
        durationS,
        status: "completed",
        outcome,
      });
    // 2026-03-10 IST = 2026-03-09T18:30Z .. 2026-03-10T18:30Z
    await mk("2026-03-09T18:00:00Z", "booked", 999); // 23:30 IST on the 9th: excluded
    await mk("2026-03-09T19:00:00Z", "booked", 60); // 00:30 IST on the 10th
    await mk("2026-03-10T10:00:00Z", "info", 120);
    await db.insert(schema.callbacks).values({
      id: newId("cb"),
      clinicId: a,
      phone: "+919876543210",
      reason: "r",
    });
    await db.insert(schema.callbacks).values({
      id: newId("cb"),
      clinicId: a,
      phone: "+919876543211",
      reason: "pain",
      priority: "urgent",
    });
    await db.insert(schema.callbacks).values({
      id: newId("cb"),
      clinicId: a,
      phone: "+919876543212",
      reason: "handled",
      priority: "urgent",
      status: "done",
    });
  });

  it("uses the clinic timezone for the day window", async () => {
    const res = await call("GET", "/stats/overview?date=2026-03-10", { sub: subs[0]!, clinic: a });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      date: "2026-03-10",
      callsToday: 2,
      bookedToday: 1,
      openCallbacks: 2,
      openUrgentCallbacks: 1,
      avgDurationS: 90,
      byOutcome: { booked: 1, info: 1 },
    });
  });

  it("defaults to today and validates the date", async () => {
    const res = await call("GET", "/stats/overview", { sub: subs[0]!, clinic: a });
    expect(res.status).toBe(200);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    expect(((await res.json()) as J).date).toBe(today);
    expect(
      (await call("GET", "/stats/overview?date=2026-02-30", { sub: subs[0]!, clinic: a })).status,
    ).toBe(400);
  });
});
