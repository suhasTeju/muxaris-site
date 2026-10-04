import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import pg from "pg";
import { createDb, schema, newId, seedDemoClinic } from "@muxaris/db";
import { createDevVerifier } from "@muxaris/core";
import { createApp } from "./app.js";

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
    "WARNING: Postgres unreachable, skipping api route tests. Run: docker compose up -d",
  );
}

const run = newId("t").slice(-8).toLowerCase();
const subA = `sub-a-${run}`;
const subB = `sub-b-${run}`;
const emailA = `a-${run}@test.example`;
const emailB = `b-${run}@test.example`;
const tokA = `dev:${subA}:${emailA}`;
const tokB = `dev:${subB}:${emailB}`;
const app = createApp({ version: "test", db, verifier: createDevVerifier() });
const clinicIds: string[] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

const call = (
  method: string,
  path: string,
  o: { token?: string; clinic?: string; body?: unknown } = {},
) =>
  app.request(`/v1${path}`, {
    method,
    headers: {
      ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}),
      ...(o.clinic ? { "X-Clinic-Id": o.clinic } : {}),
      ...(o.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(o.body !== undefined ? { body: JSON.stringify(o.body) } : {}),
  });

function nextTuesday(): string {
  let d = new Date(Date.now() + 2 * 86_400_000);
  while (d.getUTCDay() !== 2) d = new Date(d.getTime() + 86_400_000);
  return d.toISOString().slice(0, 10);
}

afterAll(async () => {
  if (reachable) {
    const users = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(inArray(schema.users.cognitoSub, [subA, subB]));
    if (clinicIds.length) {
      await db.delete(schema.clinics).where(inArray(schema.clinics.id, clinicIds));
    }
    if (users.length) {
      await db.delete(schema.memberships).where(
        inArray(
          schema.memberships.userId,
          users.map((u) => u.id),
        ),
      );
      await db.delete(schema.users).where(
        inArray(
          schema.users.id,
          users.map((u) => u.id),
        ),
      );
    }
  }
  await pool.end();
});

(reachable ? describe : describe.skip)("api v1", () => {
  let ownClinic = "";
  beforeAll(async () => {
    await seedDemoClinic(db);
  });

  it("401 without or with a bad token", async () => {
    expect((await call("GET", "/me")).status).toBe(401);
    const res = await call("GET", "/me", { token: "garbage" });
    expect(res.status).toBe(401);
    expect(((await res.json()) as J).error.code).toBe("unauthenticated");
  });

  it("/me upserts the user and lists memberships", async () => {
    const res = await call("GET", "/me", { token: tokA });
    expect(res.status).toBe(200);
    const body = (await res.json()) as J;
    expect(body.user.email).toBe(emailA);
    expect(body.memberships).toEqual([]);
    const rows = await db.select().from(schema.users).where(eq(schema.users.cognitoSub, subA));
    expect(rows).toHaveLength(1);
  });

  it("POST /clinics creates a clinic with an owner membership", async () => {
    const bad = await call("POST", "/clinics", { token: tokA, body: { name: "" } });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as J).error.code).toBe("validation");
    const res = await call("POST", "/clinics", {
      token: tokA,
      body: { name: `Test Clinic ${run}`, city: "Pune" },
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as J;
    expect(body.membership.role).toBe("owner");
    ownClinic = body.clinic.id;
    clinicIds.push(ownClinic);
    const me = (await (await call("GET", "/me", { token: tokA })).json()) as J;
    expect(me.memberships[0].clinicId).toBe(ownClinic);
    expect((await call("GET", `/clinics/${ownClinic}`, { token: tokA })).status).toBe(200);
    expect((await call("GET", `/clinics/${ownClinic}`, { token: tokB })).status).toBe(403);
  });

  it("403 for X-Clinic-Id of a clinic the user is not a member of, or a missing header", async () => {
    const res = await call("GET", "/doctors", { token: tokB, clinic: ownClinic });
    expect(res.status).toBe(403);
    expect(((await res.json()) as J).error.code).toBe("forbidden");
    expect((await call("GET", "/doctors", { token: tokB })).status).toBe(403);
  });

  it("owner-only routes reject front_desk members", async () => {
    const [u] = await db
      .insert(schema.users)
      .values({ id: newId("usr"), cognitoSub: subB, email: emailB })
      .onConflictDoNothing()
      .returning();
    const userB =
      u ?? (await db.select().from(schema.users).where(eq(schema.users.cognitoSub, subB)))[0]!;
    await db.insert(schema.memberships).values({
      id: newId("mem"),
      userId: userB.id,
      clinicId: ownClinic,
      role: "front_desk",
    });
    expect((await call("GET", "/doctors", { token: tokB, clinic: ownClinic })).status).toBe(200);
    const res = await call("POST", "/doctors", {
      token: tokB,
      clinic: ownClinic,
      body: { name: "Dr X" },
    });
    expect(res.status).toBe(403);
    await db.delete(schema.memberships).where(eq(schema.memberships.userId, userB.id));
  });

  it("onboarding step validates", async () => {
    const get = (await (
      await call("GET", "/onboarding", { token: tokA, clinic: ownClinic })
    ).json()) as J;
    expect(get.step).toBe("basics");
    const bad = await call("PUT", "/onboarding/step", {
      token: tokA,
      clinic: ownClinic,
      body: { step: "nope" },
    });
    expect(bad.status).toBe(400);
    const ok = await call("PUT", "/onboarding/step", {
      token: tokA,
      clinic: ownClinic,
      body: { step: "doctors" },
    });
    expect(((await ok.json()) as J).step).toBe("doctors");
  });

  it("POST /demo/load fills a fresh clinic", async () => {
    const res = await call("POST", "/demo/load", { token: tokA, clinic: ownClinic });
    expect(res.status).toBe(200);
    const docs = (await (
      await call("GET", "/doctors", { token: tokA, clinic: ownClinic })
    ).json()) as J;
    const svcs = (await (
      await call("GET", "/services", { token: tokA, clinic: ownClinic })
    ).json()) as J;
    expect(docs.doctors.length).toBeGreaterThan(0);
    expect(svcs.services.length).toBeGreaterThan(0);
  });

  it("validates date query, slots, booking and conflicts on the demo clinic", async () => {
    const user = (
      await db.select().from(schema.users).where(eq(schema.users.cognitoSub, subA))
    )[0]!;
    await db
      .insert(schema.memberships)
      .values({ id: newId("mem"), userId: user.id, clinicId: "cl_demo_sunrise", role: "owner" });
    const c = "cl_demo_sunrise";
    const bad = await call("GET", "/slots?date=2026-02-30&serviceId=svc_demo_consult", {
      token: tokA,
      clinic: c,
    });
    expect(bad.status).toBe(400);
    const date = nextTuesday();
    const res = await call("GET", `/slots?date=${date}&serviceId=svc_demo_consult`, {
      token: tokA,
      clinic: c,
    });
    expect(res.status).toBe(200);
    const { slots } = (await res.json()) as J;
    expect(slots.length).toBeGreaterThan(0);
    const slot = slots[slots.length - 1];
    const payload = {
      patient: { phone: "9876543210", name: "Test Patient" },
      doctorId: slot.doctorId,
      serviceId: "svc_demo_consult",
      startsAt: slot.startsAt,
    };
    const ok = await call("POST", "/appointments", { token: tokA, clinic: c, body: payload });
    expect(ok.status).toBe(201);
    const apt = ((await ok.json()) as J).appointment;
    try {
      const again = await call("POST", "/appointments", { token: tokA, clinic: c, body: payload });
      expect(again.status).toBe(409);
      expect(((await again.json()) as J).error.code).toBe("conflict");
    } finally {
      const cancel = await call("POST", `/appointments/${apt.id}/cancel`, {
        token: tokA,
        clinic: c,
      });
      expect(cancel.status).toBe(200);
      await db.delete(schema.appointments).where(eq(schema.appointments.id, apt.id));
      await db.delete(schema.patients).where(eq(schema.patients.id, apt.patientId));
      await db
        .delete(schema.memberships)
        .where(and(eq(schema.memberships.userId, user.id), eq(schema.memberships.clinicId, c)));
    }
  });

  it("returns 500 (logged, without body) for RangeError from stored data", async () => {
    await db
      .update(schema.clinics)
      .set({ timezone: "Not/AZone" })
      .where(eq(schema.clinics.id, ownClinic));
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const svcs = (await (
      await call("GET", "/services", { token: tokA, clinic: ownClinic })
    ).json()) as J;
    const res = await call("GET", `/slots?date=${nextTuesday()}&serviceId=${svcs.services[0].id}`, {
      token: tokA,
      clinic: ownClinic,
    });
    expect(res.status).toBe(500);
    expect(((await res.json()) as J).error.code).toBe("internal");
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("keeps the stored email when the verifier returns none, rejects unknown users", async () => {
    const noEmail = {
      verify: async (t: string) => ({ sub: t.slice(4), username: "x" }),
    };
    const a2 = createApp({ version: "t", db, verifier: noEmail });
    const known = await a2.request("/v1/me", { headers: { Authorization: `Bearer dev:${subA}` } });
    expect(known.status).toBe(200);
    expect(((await known.json()) as J).user.email).toBe(emailA);
    const unknown = await a2.request("/v1/me", {
      headers: { Authorization: `Bearer dev:never-${run}` },
    });
    expect(unknown.status).toBe(401);
  });
});
