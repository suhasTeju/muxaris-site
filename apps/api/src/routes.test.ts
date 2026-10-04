import { afterAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import pg from "pg";
import { createDb, schema, newId } from "@muxaris/db";
import { AuthUnavailableError, appendTurn, createCall, createDevVerifier } from "@muxaris/core";
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

  it("validates date query, slots, booking, conflicts, reschedule and cancel", async () => {
    const c = ownClinic;
    const svcs = (await (await call("GET", "/services", { token: tokA, clinic: c })).json()) as J;
    const svc = svcs.services.find((x: J) => x.name === "Consultation") ?? svcs.services[0];
    const bad = await call("GET", `/slots?date=2026-02-30&serviceId=${svc.id}`, {
      token: tokA,
      clinic: c,
    });
    expect(bad.status).toBe(400);
    const date = nextTuesday();
    const res = await call("GET", `/slots?date=${date}&serviceId=${svc.id}`, {
      token: tokA,
      clinic: c,
    });
    expect(res.status).toBe(200);
    const { slots } = (await res.json()) as J;
    expect(slots.length).toBeGreaterThan(2);
    const slot = slots[slots.length - 1];
    const payload = {
      patient: { phone: "9876543210", name: "Test Patient" },
      doctorId: slot.doctorId,
      serviceId: svc.id,
      startsAt: slot.startsAt,
    };
    const ok = await call("POST", "/appointments", { token: tokA, clinic: c, body: payload });
    expect(ok.status).toBe(201);
    const apt = ((await ok.json()) as J).appointment;
    const again = await call("POST", "/appointments", { token: tokA, clinic: c, body: payload });
    expect(again.status).toBe(409);
    expect(((await again.json()) as J).error.code).toBe("conflict");

    // cross-tenant: another clinic cannot see or touch this appointment
    const other = (await (
      await call("POST", "/clinics", { token: tokB, body: { name: `Other ${run}`, city: "Pune" } })
    ).json()) as J;
    clinicIds.push(other.clinic.id);
    const x = other.clinic.id;
    expect(
      (await call("POST", `/appointments/${apt.id}/cancel`, { token: tokB, clinic: x })).status,
    ).toBe(404);
    expect(
      (
        await call("PATCH", `/appointments/${apt.id}/reschedule`, {
          token: tokB,
          clinic: x,
          body: { startsAt: slots[0].startsAt },
        })
      ).status,
    ).toBe(404);

    // reschedule: changing doctor/service is a 400, a new start works
    const wrongDoc = await call("PATCH", `/appointments/${apt.id}/reschedule`, {
      token: tokA,
      clinic: c,
      body: { startsAt: slots[0].startsAt, doctorId: "doc_nope" },
    });
    expect(wrongDoc.status).toBe(400);
    const moved = await call("PATCH", `/appointments/${apt.id}/reschedule`, {
      token: tokA,
      clinic: c,
      body: { startsAt: slots[0].startsAt, doctorId: apt.doctorId },
    });
    expect(moved.status).toBe(200);
    const m = ((await moved.json()) as J).appointment;
    expect(m.status).toBe("rescheduled");
    expect(new Date(m.startsAt).toISOString()).toBe(new Date(slots[0].startsAt).toISOString());

    // list range validation and defaults
    const from = "2030-01-02T00:00:00Z";
    expect(
      (
        await call("GET", `/appointments?from=${from}&to=2030-01-01T00:00:00Z`, {
          token: tokA,
          clinic: c,
        })
      ).status,
    ).toBe(400);
    const list = (await (
      await call("GET", `/appointments?from=${date}T00:00:00Z&to=${date}T23:59:59Z`, {
        token: tokA,
        clinic: c,
      })
    ).json()) as J;
    expect(list.appointments.map((q: J) => q.id)).toContain(apt.id);
    expect((await call("GET", "/appointments", { token: tokA, clinic: c })).status).toBe(200);

    // cancel: malformed body 400, reason too long 400, valid cancel 200
    const raw = (body: string) =>
      app.request(`/v1/appointments/${apt.id}/cancel`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokA}`,
          "X-Clinic-Id": c,
          "Content-Type": "application/json",
        },
        body,
      });
    expect((await raw("{not json")).status).toBe(400);
    expect((await raw(JSON.stringify({ reason: "x".repeat(301) }))).status).toBe(400);
    expect((await raw(JSON.stringify({ reason: "patient asked" }))).status).toBe(200);
    expect(
      (await call("POST", `/appointments/${apt.id}/cancel`, { token: tokA, clinic: c })).status,
    ).toBe(200);
  });

  it("paginates patients and calls and validates limits", async () => {
    const c = ownClinic;
    expect((await call("GET", "/patients?limit=0", { token: tokA, clinic: c })).status).toBe(400);
    expect((await call("GET", "/patients?limit=201", { token: tokA, clinic: c })).status).toBe(400);
    const p = (await (
      await call("GET", "/patients?limit=1&offset=0", { token: tokA, clinic: c })
    ).json()) as J;
    expect(p.patients).toHaveLength(1);
    expect((await call("GET", "/calls?offset=-1", { token: tokA, clinic: c })).status).toBe(400);
  });

  it("GET /calls filters by from/to on startedAt and validates them", async () => {
    const c = await createCall(db, { clinicId: ownClinic, channel: "browser" });
    const ids = async (qs: string) =>
      (
        (await (await call("GET", `/calls?${qs}`, { token: tokA, clinic: ownClinic })).json()) as J
      ).calls.map((x: J) => x.id);
    const past = new Date(Date.now() - 3_600_000).toISOString();
    const future = new Date(Date.now() + 3_600_000).toISOString();
    expect(await ids(new URLSearchParams({ from: past, to: future }).toString())).toContain(c.id);
    expect(await ids(new URLSearchParams({ from: future }).toString())).not.toContain(c.id);
    expect(await ids(new URLSearchParams({ to: past }).toString())).not.toContain(c.id);
    expect(
      (await call("GET", "/calls?from=yesterday", { token: tokA, clinic: ownClinic })).status,
    ).toBe(400);
  });

  it("GET /calls/:id returns the call with its turns, scoped to the clinic", async () => {
    const c = await createCall(db, { clinicId: ownClinic, channel: "browser" });
    await appendTurn(db, { callId: c.id, clinicId: ownClinic, seq: 1, role: "user", text: "hi" });
    await appendTurn(db, {
      callId: c.id,
      clinicId: ownClinic,
      seq: 2,
      role: "assistant",
      text: "hello",
    });
    const res = await call("GET", `/calls/${c.id}`, { token: tokA, clinic: ownClinic });
    expect(res.status).toBe(200);
    const body = (await res.json()) as J;
    expect(body.call.id).toBe(c.id);
    expect(body.turns.map((t: J) => t.seq)).toEqual([1, 2]);
    const list = (await (
      await call("GET", "/calls", { token: tokA, clinic: ownClinic })
    ).json()) as J;
    expect(list.calls.map((x: J) => x.id)).toContain(c.id);
    expect(
      (await call("GET", `/calls/${c.id}`, { token: tokB, clinic: clinicIds[1] })).status,
    ).toBe(404);
  });

  it("PUT /slot-rules updates and persists", async () => {
    const put = await call("PUT", "/slot-rules", {
      token: tokA,
      clinic: ownClinic,
      body: { slotGrainMin: 30, maxPerSlot: 2 },
    });
    expect(put.status).toBe(200);
    const got = (await (
      await call("GET", "/slot-rules", { token: tokA, clinic: ownClinic })
    ).json()) as J;
    expect(got.slotRules).toMatchObject({ slotGrainMin: 30, maxPerSlot: 2 });
    const bad = await call("PUT", "/slot-rules", {
      token: tokA,
      clinic: ownClinic,
      body: { slotGrainMin: 1 },
    });
    expect(bad.status).toBe(400);
  });

  it("accepts end-of-day hours (24:00) through the API", async () => {
    const docs = (await (
      await call("GET", "/doctors", { token: tokA, clinic: ownClinic })
    ).json()) as J;
    const res = await call("PUT", `/doctors/${docs.doctors[0].id}/hours`, {
      token: tokA,
      clinic: ownClinic,
      body: { hours: [{ weekday: 1, startTime: "09:00", endTime: "24:00" }] },
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as J).hours[0].endTime).toBe("24:00");
    const empty = await call("PUT", `/doctors/${docs.doctors[0].id}/hours`, {
      token: tokA,
      clinic: ownClinic,
      body: { hours: [{ weekday: 1, startTime: "00:00", endTime: "00:00" }] },
    });
    expect(empty.status).toBe(400);
  });

  it("accepts a lowercase bearer scheme", async () => {
    const res = await app.request("/v1/me", { headers: { Authorization: `bearer ${tokA}` } });
    expect(res.status).toBe(200);
  });

  it("returns 409 when another sign-in already owns the email", async () => {
    const res = await call("GET", "/me", { token: `dev:other-${run}:${emailA.toUpperCase()}` });
    expect(res.status).toBe(409);
    const body = (await res.json()) as J;
    expect(body.error.code).toBe("conflict");
    expect(JSON.stringify(body)).not.toContain(run);
  });

  it("returns 503 auth_unavailable when the verifier is transiently down", async () => {
    const down = createApp({
      version: "t",
      db,
      verifier: {
        verify: async () => {
          throw new AuthUnavailableError();
        },
      },
    });
    const res = await down.request("/v1/me", { headers: { Authorization: "Bearer x" } });
    expect(res.status).toBe(503);
    expect(((await res.json()) as J).error.code).toBe("auth_unavailable");
  });

  it("honours the CORS allowlist", async () => {
    const cors = createApp({
      version: "t",
      db,
      verifier: createDevVerifier(),
      corsOrigins: ["https://app.example"],
    });
    const ok = await cors.request("/healthz", { headers: { Origin: "https://app.example" } });
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://app.example");
    const bad = await cors.request("/healthz", { headers: { Origin: "https://evil.example" } });
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();
    const pre = await cors.request("/v1/me", {
      method: "OPTIONS",
      headers: {
        Origin: "https://app.example",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "x-clinic-id,authorization",
      },
    });
    expect(pre.headers.get("access-control-allow-headers")).toMatch(/X-Clinic-Id/i);
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
