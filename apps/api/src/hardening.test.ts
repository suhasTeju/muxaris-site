import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import pg from "pg";
import { createDb, schema, newId } from "@muxaris/db";
import { createCognitoVerifier, createDevVerifier } from "@muxaris/core";
import {
  FetchError,
  JwtExpiredError,
  JwtInvalidAudienceError,
  NonRetryableFetchError,
} from "aws-jwt-verify/error";
import { createApp } from "./app.js";

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
if (!reachable) console.warn("WARNING: Postgres unreachable, skipping api hardening tests.");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
const run = newId("t").slice(-8).toLowerCase();
const subs = [`h-a-${run}`, `h-cap-${run}`, `h-fd-${run}`];
const tok = (sub: string) => `dev:${sub}:${sub}@test.example`;
const app = createApp({ version: "test", db, verifier: createDevVerifier() });
const clinicIds: string[] = [];

const call = (
  method: string,
  path: string,
  o: { token?: string; clinic?: string; body?: unknown; raw?: string } = {},
) =>
  app.request(`/v1${path}`, {
    method,
    headers: {
      ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}),
      ...(o.clinic ? { "X-Clinic-Id": o.clinic } : {}),
      ...(o.body !== undefined || o.raw !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
    },
    ...(o.raw !== undefined
      ? { body: o.raw }
      : o.body !== undefined
        ? { body: JSON.stringify(o.body) }
        : {}),
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

function nextTuesday(): string {
  let d = new Date(Date.now() + 2 * 86_400_000);
  while (d.getUTCDay() !== 2) d = new Date(d.getTime() + 86_400_000);
  return d.toISOString().slice(0, 10);
}

describe("auth error classification over HTTP", () => {
  const withJwtError = (err: unknown) =>
    createApp({
      version: "t",
      db,
      verifier: createCognitoVerifier({
        userPoolId: "ap-south-1_abc",
        clientId: "c",
        jwtVerifier: { verify: async () => Promise.reject(err) },
        fetchEmail: async () => "x@y.in",
      }),
    }).request("/v1/me", { headers: { Authorization: "Bearer x" } });
  const withGetUserError = (err: unknown) =>
    createApp({
      version: "t",
      db,
      verifier: createCognitoVerifier({
        userPoolId: "ap-south-1_abc",
        clientId: "c",
        jwtVerifier: { verify: async () => ({ sub: "s", username: "u" }) },
        fetchEmail: async () => Promise.reject(err),
      }),
    }).request("/v1/me", { headers: { Authorization: "Bearer x" } });

  it("expired / wrong audience / garbage -> 401", async () => {
    for (const err of [
      new JwtExpiredError("expired", 1, 2),
      new JwtInvalidAudienceError("aud", "a", "b"),
      new Error("garbage"),
    ]) {
      expect((await withJwtError(err)).status).toBe(401);
    }
  });
  it("JWKS fetch / network failures -> 503 auth_unavailable", async () => {
    for (const err of [
      new FetchError("https://jwks", "ECONNRESET"),
      new NonRetryableFetchError("https://jwks", "500"),
    ]) {
      const res = await withJwtError(err);
      expect(res.status).toBe(503);
      expect(((await res.json()) as J).error.code).toBe("auth_unavailable");
    }
  });
  it("GetUser transient -> 503, user-not-found -> 401", async () => {
    expect((await withGetUserError(new Error("socket hang up"))).status).toBe(503);
    const gone = Object.assign(new Error("gone"), { name: "UserNotFoundException" });
    expect((await withGetUserError(gone)).status).toBe(401);
  });
});

(reachable ? describe : describe.skip)("api hardening", () => {
  let clinic = "";
  let svcId = "";
  let doctorId = "";

  it("setup: clinic with demo data", async () => {
    const res = await call("POST", "/clinics", {
      token: tok(subs[0]!),
      body: { name: `Hard ${run}`, city: "Pune" },
    });
    expect(res.status).toBe(201);
    clinic = ((await res.json()) as J).clinic.id;
    clinicIds.push(clinic);
    expect(
      (await call("POST", "/demo/load", { token: tok(subs[0]!), clinic })).status,
    ).toBeLessThan(300);
    const svcs = (await (
      await call("GET", "/services", { token: tok(subs[0]!), clinic })
    ).json()) as J;
    svcId = svcs.services[0].id;
  });

  it("GET /doctors includes working hours", async () => {
    const { doctors } = (await (
      await call("GET", "/doctors", { token: tok(subs[0]!), clinic })
    ).json()) as J;
    doctorId = doctors[0].id;
    expect(doctors[0].workingHours.length).toBeGreaterThan(0);
    expect(doctors[0].workingHours[0]).toMatchObject({
      weekday: expect.any(Number),
      startTime: expect.stringMatching(/^\d\d:\d\d$/),
    });
  });

  it("booking an off-hours time returns 409 slot_unavailable with a reason; patient is masked", async () => {
    const date = nextTuesday();
    const bad = await call("POST", "/appointments", {
      token: tok(subs[0]!),
      clinic,
      body: {
        patient: { phone: "9876543210", name: "Mask Me" },
        doctorId,
        serviceId: svcId,
        startsAt: `${date}T03:00:00+05:30`,
      },
    });
    expect(bad.status).toBe(409);
    const body = (await bad.json()) as J;
    expect(body.error.code).toBe("slot_unavailable");
    expect(body.reason).toBe("outside_hours");
    expect(body.error.reason).toBe("outside_hours");

    // explicit opt-in bypasses the hours check
    const ok = await call("POST", "/appointments", {
      token: tok(subs[0]!),
      clinic,
      body: {
        patient: { phone: "9876543210", name: "Mask Me" },
        doctorId,
        serviceId: svcId,
        startsAt: `${date}T03:00:00+05:30`,
        allowOutsideRules: true,
      },
    });
    expect(ok.status).toBe(201);
    expect(((await ok.json()) as J).appointment.patient).toEqual({
      name: "Mask Me",
      phoneMasked: "+91 •••• ••3210",
    });
    const list = (await (
      await call("GET", `/appointments?from=${date}T00:00:00%2B05:30&to=${date}T23:59:00%2B05:30`, {
        token: tok(subs[0]!),
        clinic,
      })
    ).json()) as J;
    expect(list.appointments[0].patient.phoneMasked).toBe("+91 •••• ••3210");
  });

  it("allowOutsideRules is owner-only; front_desk gets 403 owner_required", async () => {
    const fd = tok(subs[2]!);
    await call("GET", "/me", { token: fd });
    const [u] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.cognitoSub, subs[2]!));
    await db
      .insert(schema.memberships)
      .values({ id: newId("mem"), userId: u!.id, clinicId: clinic, role: "front_desk" });
    const date = nextTuesday();
    const body = (extra: object) => ({
      patient: { phone: "9876543211", name: "Walk In" },
      doctorId,
      serviceId: svcId,
      startsAt: `${date}T02:00:00+05:30`,
      ...extra,
    });
    for (const token of [fd, tok(subs[0]!)]) {
      const res = await call("POST", "/appointments", { token, clinic, body: body({}) });
      expect(res.status).toBe(409);
      expect(((await res.json()) as J).reason).toBe("outside_hours");
    }
    const denied = await call("POST", "/appointments", {
      token: fd,
      clinic,
      body: body({ allowOutsideRules: true }),
    });
    expect(denied.status).toBe(403);
    expect(((await denied.json()) as J).error.code).toBe("owner_required");
    const deniedResched = await call("PATCH", "/appointments/apt_x/reschedule", {
      token: fd,
      clinic,
      body: { startsAt: `${date}T02:00:00+05:30`, allowOutsideRules: true },
    });
    expect(deniedResched.status).toBe(403);
    const ok = await call("POST", "/appointments", {
      token: tok(subs[0]!),
      clinic,
      body: body({ allowOutsideRules: true }),
    });
    const okBody = (await ok.json()) as J;
    expect({ status: ok.status, reason: okBody.reason ?? okBody.error?.code }).toEqual({
      status: 201,
      reason: undefined,
    });
  });

  it("rejects an over-wide appointment range", async () => {
    const res = await call(
      "GET",
      "/appointments?from=2030-01-01T00:00:00%2B05:30&to=2030-06-01T00:00:00%2B05:30",
      { token: tok(subs[0]!), clinic },
    );
    expect(res.status).toBe(400);
  });

  it("over-bound bodies return 400", async () => {
    const t = tok(subs[0]!);
    const long = "x".repeat(3000);
    const cases: Array<[string, string, unknown]> = [
      ["POST", "/clinics", { name: "x".repeat(121), city: "Pune" }],
      ["POST", "/doctors", { name: "x".repeat(121) }],
      ["POST", "/services", { name: "S", durationMin: 99_999_999_999 }],
      ["POST", "/services", { name: "S", durationMin: 30, priceInr: 2_000_000 }],
      [
        "POST",
        "/appointments",
        {
          patient: { phone: "9876543210" },
          doctorId,
          serviceId: svcId,
          startsAt: "2030-01-01T10:00:00+05:30",
          notes: long,
        },
      ],
    ];
    for (const [m, p, body] of cases) {
      const res = await call(m, p, { token: t, clinic, body });
      expect(res.status, `${m} ${p}`).toBe(400);
    }
  });

  it("oversized bodies return 413 (64 KiB authenticated, 16 KiB public)", async () => {
    const big = JSON.stringify({ name: "x".repeat(70 * 1024) });
    const res = await call("POST", "/doctors", { token: tok(subs[0]!), clinic, raw: big });
    expect(res.status).toBe(413);
    expect(((await res.json()) as J).error.code).toBe("payload_too_large");
    const pub = await app.request("/v1/demo-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x".repeat(20 * 1024) }),
    });
    expect(pub.status).toBe(413);
  });

  it("caps clinics per user at 5 (409 clinic_limit)", async () => {
    const t = tok(subs[1]!);
    for (let i = 0; i < 5; i++) {
      const res = await call("POST", "/clinics", {
        token: t,
        body: { name: `Cap ${i} ${run}`, city: "Pune" },
      });
      expect(res.status).toBe(201);
      clinicIds.push(((await res.json()) as J).clinic.id);
    }
    const res = await call("POST", "/clinics", {
      token: t,
      body: { name: `Cap 6 ${run}`, city: "Pune" },
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as J).error.code).toBe("clinic_limit");
  });
});
