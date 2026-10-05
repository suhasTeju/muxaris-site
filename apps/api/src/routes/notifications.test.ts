import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
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
if (!reachable) console.warn("WARNING: Postgres unreachable, skipping notifications tests.");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
const run = newId("t").slice(-8).toLowerCase();
const subs = [`ntf-a-${run}`, `ntf-b-${run}`];
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

d("notification routes", () => {
  let ca = "";
  let cb = "";
  beforeAll(async () => {
    ca = await mkClinic(subs[0]!, "Ntf A");
    cb = await mkClinic(subs[1]!, "Ntf B");
  });

  it("booking writes an outbox row; staff can list, retry after adding an email, and toggle settings", async () => {
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
    const t = new Date(Date.now() + 3 * 86_400_000);
    t.setUTCHours(5, 30, 0, 0);
    const booked = (await (
      await call("POST", "/appointments", {
        sub: subs[0]!,
        clinic: ca,
        body: {
          patient: { phone: "9876543300", name: "Asha" },
          doctorId: doc.doctor.id,
          serviceId: svc.service.id,
          startsAt: t.toISOString(),
          allowOutsideRules: true,
        },
      })
    ).json()) as J;
    const aptId = booked.appointment.id as string;
    const l = (await (
      await call("GET", `/notifications?appointmentId=${aptId}`, { sub: subs[0]!, clinic: ca })
    ).json()) as J;
    expect(l.total).toBe(1);
    expect(l.notifications[0].status).toBe("skipped");
    expect(l.notifications[0].error).toBe("no_contact");
    expect(l.notifications[0].to).toBeUndefined();
    const other = (await (
      await call("GET", `/notifications?appointmentId=${aptId}`, { sub: subs[1]!, clinic: cb })
    ).json()) as J;
    expect(other.total).toBe(0);

    await call("PATCH", `/patients/${booked.appointment.patientId}`, {
      sub: subs[0]!,
      clinic: ca,
      body: { email: "asha@example.test" },
    });
    const retry = await call("POST", `/notifications/${l.notifications[0].id}/retry`, {
      sub: subs[0]!,
      clinic: ca,
    });
    expect(retry.status).toBe(200);
    expect(((await retry.json()) as J).notification).toMatchObject({
      status: "queued",
      toMasked: "a•••@example.test",
    });
    expect(
      (
        await call("POST", `/notifications/${l.notifications[0].id}/retry`, {
          sub: subs[0]!,
          clinic: ca,
        })
      ).status,
    ).toBe(409);

    const patch = (settings: unknown) =>
      call("PATCH", `/clinics/${ca}`, { sub: subs[0]!, clinic: ca, body: { settings } });
    const patched = await patch({ notifications: { reminders: false } });
    expect(patched.status).toBe(200);
    expect(((await patched.json()) as J).clinic.settings.notifications).toEqual({
      reminders: false,
    });
    const p2 = (await (await patch({ recordCalls: false })).json()) as J;
    expect(p2.clinic.settings).toEqual({ recordCalls: false, notifications: { reminders: false } });
    const p3 = (await (await patch({ notifications: { confirmations: false } })).json()) as J;
    expect(p3.clinic.settings.notifications).toEqual({ reminders: false, confirmations: false });
  });

  it("refuses to retry a confirmation for a cancelled appointment", async () => {
    const doc = (await (
      await call("POST", "/doctors", { sub: subs[1]!, clinic: cb, body: { name: "Dr Iyer" } })
    ).json()) as J;
    const svc = (await (
      await call("POST", "/services", {
        sub: subs[1]!,
        clinic: cb,
        body: { name: "Filling", durationMin: 30 },
      })
    ).json()) as J;
    const t = new Date(Date.now() + 4 * 86_400_000);
    t.setUTCHours(6, 0, 0, 0);
    const booked = (await (
      await call("POST", "/appointments", {
        sub: subs[1]!,
        clinic: cb,
        body: {
          patient: { phone: "9876543301", name: "Kiran" },
          doctorId: doc.doctor.id,
          serviceId: svc.service.id,
          startsAt: t.toISOString(),
          allowOutsideRules: true,
        },
      })
    ).json()) as J;
    const aptId = booked.appointment.id as string;
    const cancelled = await call("POST", `/appointments/${aptId}/cancel`, {
      sub: subs[1]!,
      clinic: cb,
      body: {},
    });
    expect(cancelled.status).toBe(200);
    await call("PATCH", `/patients/${booked.appointment.patientId}`, {
      sub: subs[1]!,
      clinic: cb,
      body: { email: "kiran@example.test" },
    });
    const l = (await (
      await call("GET", `/notifications?appointmentId=${aptId}`, { sub: subs[1]!, clinic: cb })
    ).json()) as J;
    const conf = (l.notifications as J[]).find((n) => n.template === "appointment_confirmed");
    expect(conf.status).toBe("skipped");
    const retry = await call("POST", `/notifications/${conf.id}/retry`, {
      sub: subs[1]!,
      clinic: cb,
    });
    expect(retry.status).toBe(409);
    expect(((await retry.json()) as J).error.code).toBe("conflict");
  });
});
