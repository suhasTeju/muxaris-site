import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import pg from "pg";
import { createDb, schema, newId } from "@muxaris/db";
import { createDevVerifier } from "@muxaris/core";
import { FakeBlobStore } from "@muxaris/storage/fakes";
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
if (!reachable) console.warn("WARNING: Postgres unreachable, skipping patients tests.");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
const run = newId("t").slice(-8).toLowerCase();
const subs = [`patients-a-${run}`, `patients-b-${run}`];
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

d("patient routes", () => {
  let ca = "";
  let cb = "";
  beforeAll(async () => {
    ca = await mkClinic(subs[0]!, "Pat A");
    cb = await mkClinic(subs[1]!, "Pat B");
  });

  it("creates, lists masked, rejects duplicates and bad emails", async () => {
    const res = await call("POST", "/patients", {
      sub: subs[0]!,
      clinic: ca,
      body: { phone: "9876543210", name: "Ravi", email: " ravi@example.test " },
    });
    expect(res.status).toBe(201);
    const { patient } = (await res.json()) as J;
    expect(patient.phoneMasked).toBe("+91 •••• ••3210");
    expect(patient.phone).toBeUndefined();
    expect(patient.email).toBe("ravi@example.test");
    expect(
      (
        await call("POST", "/patients", {
          sub: subs[0]!,
          clinic: ca,
          body: { phone: "9876543210" },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call("PATCH", `/patients/${patient.id}`, {
          sub: subs[0]!,
          clinic: ca,
          body: { email: " bad " },
        })
      ).status,
    ).toBe(400);
    const list = (await (
      await call("GET", "/patients?q=rav", { sub: subs[0]!, clinic: ca })
    ).json()) as J;
    expect(list.total).toBe(1);
    expect(JSON.stringify(list)).not.toContain("9876543210");
    // tenant isolation
    expect(
      (await call("GET", `/patients/${patient.id}`, { sub: subs[1]!, clinic: cb })).status,
    ).toBe(404);
  });

  it("updates, reveals with an audit row, and shows detail", async () => {
    const { patient } = (await (
      await call("POST", "/patients", { sub: subs[0]!, clinic: ca, body: { phone: "9876543211" } })
    ).json()) as J;
    const up = await call("PATCH", `/patients/${patient.id}`, {
      sub: subs[0]!,
      clinic: ca,
      body: { name: "Meena", preferredLanguage: "kn-IN", notes: null },
    });
    expect(up.status).toBe(200);
    expect(((await up.json()) as J).patient.preferredLanguage).toBe("kn-IN");
    const rev = await call("POST", `/patients/${patient.id}/reveal-phone`, {
      sub: subs[0]!,
      clinic: ca,
    });
    expect(rev.status).toBe(200);
    expect(((await rev.json()) as J).phone).toBe("+919876543211");
    const [aud] = await db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, patient.id));
    expect(aud?.action).toBe("patient.phone.reveal");
    const det = (await (
      await call("GET", `/patients/${patient.id}`, { sub: subs[0]!, clinic: ca })
    ).json()) as J;
    expect(det.patient.id).toBe(patient.id);
    expect(Array.isArray(det.appointments)).toBe(true);
    expect(Array.isArray(det.calls)).toBe(true);
  });

  it("marks a past appointment as no-show and refuses a future one", async () => {
    const doc = (await (
      await call("POST", "/doctors", { sub: subs[0]!, clinic: ca, body: { name: "Dr Rao" } })
    ).json()) as J;
    const svc = (await (
      await call("POST", "/services", {
        sub: subs[0]!,
        clinic: ca,
        body: { name: "Cleaning", durationMin: 30 },
      })
    ).json()) as J;
    // booking guards reject the past, so book ahead and age the row directly
    const start = new Date(Date.now() + 3 * 86_400_000);
    start.setUTCHours(5, 30, 0, 0);
    const booked = await call("POST", "/appointments", {
      sub: subs[0]!,
      clinic: ca,
      body: {
        patient: { phone: "9876543212" },
        doctorId: doc.doctor.id,
        serviceId: svc.service.id,
        startsAt: start.toISOString(),
        allowOutsideRules: true,
      },
    });
    expect(booked.status).toBe(201);
    const apt = ((await booked.json()) as J).appointment;
    const past = new Date(Date.now() - 2 * 86_400_000);
    await db
      .update(schema.appointments)
      .set({ startsAt: past, endsAt: new Date(past.getTime() + 30 * 60_000) })
      .where(eq(schema.appointments.id, apt.id));
    const ns = await call("POST", `/appointments/${apt.id}/status`, {
      sub: subs[0]!,
      clinic: ca,
      body: { status: "no_show" },
    });
    expect(ns.status).toBe(200);
    const nsBody = (await ns.json()) as J;
    expect(nsBody.appointment.status).toBe("no_show");
    expect(nsBody.appointment.patient.phoneMasked).toBe("+91 •••• ••3212");
    const future = new Date(Date.now() + 3 * 86_400_000);
    future.setUTCHours(5, 30, 0, 0);
    const b2 = (await (
      await call("POST", "/appointments", {
        sub: subs[0]!,
        clinic: ca,
        body: {
          patient: { phone: "9876543212" },
          doctorId: doc.doctor.id,
          serviceId: svc.service.id,
          startsAt: future.toISOString(),
          allowOutsideRules: true,
        },
      })
    ).json()) as J;
    expect(
      (
        await call("POST", `/appointments/${b2.appointment.id}/status`, {
          sub: subs[0]!,
          clinic: ca,
          body: { status: "completed" },
        })
      ).status,
    ).toBe(409);
  });
});
