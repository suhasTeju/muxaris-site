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
if (!reachable) console.warn("WARNING: Postgres unreachable, skipping calls tests.");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
const run = newId("t").slice(-8).toLowerCase();
const subs = [`calls-a-${run}`, `calls-b-${run}`];
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

d("call routes", () => {
  let a = "";
  let b = "";
  const ids: Record<string, string> = {};
  beforeAll(async () => {
    a = await mkClinic(subs[0]!, "CallsA");
    b = await mkClinic(subs[1]!, "CallsB");
    const mk = async (
      clinicId: string,
      key: string,
      v: Partial<typeof schema.calls.$inferInsert>,
    ) => {
      const id = newId("call");
      await db.insert(schema.calls).values({ id, clinicId, channel: "phone", ...v });
      ids[key] = id;
    };
    await mk(a, "booked", {
      outcome: "booked",
      status: "completed",
      startedAt: new Date("2026-03-01T10:00:00Z"),
    });
    await mk(a, "info", {
      outcome: "info",
      status: "completed",
      channel: "browser",
      startedAt: new Date("2026-03-02T10:00:00Z"),
    });
    await mk(a, "ready", {
      recordingStatus: "ready",
      recordingS3Key: `clinics/${a}/calls/r.ogg`,
      startedAt: new Date("2026-03-03T10:00:00Z"),
    });
    await mk(a, "pending", {
      recordingStatus: "pending",
      startedAt: new Date("2026-03-04T10:00:00Z"),
    });
    await mk(a, "none", { startedAt: new Date("2026-03-05T10:00:00Z") });
    await mk(a, "failed", {
      recordingStatus: "failed",
      startedAt: new Date("2026-03-06T10:00:00Z"),
    });
    await mk(b, "other", { recordingStatus: "ready", recordingS3Key: `clinics/${b}/calls/x.ogg` });
  });

  it("lists with filters and total", async () => {
    const list = async (qs: string) =>
      (await (await call("GET", `/calls${qs}`, { sub: subs[0]!, clinic: a })).json()) as J;
    const all = await list("");
    expect(all.total).toBe(6);
    expect(all.calls).toHaveLength(6);
    const booked = await list("?outcome=booked");
    expect(booked.total).toBe(1);
    expect(booked.calls[0].id).toBe(ids.booked);
    expect((await list("?channel=browser")).total).toBe(1);
    expect((await list("?status=completed")).total).toBe(2);
    const range = await list("?from=2026-03-02T00:00:00Z&to=2026-03-04T00:00:00Z");
    expect(range.total).toBe(2);
    const paged = await list("?limit=2&offset=1");
    expect(paged.total).toBe(6);
    expect(paged.calls).toHaveLength(2);
    expect((await call("GET", "/calls?limit=0", { sub: subs[0]!, clinic: a })).status).toBe(400);
    expect((await call("GET", "/calls?outcome=nope", { sub: subs[0]!, clinic: a })).status).toBe(
      400,
    );
  });

  it("GET /calls/:id returns call, turns and callbacks; cross-tenant is 404", async () => {
    const res = await call("GET", `/calls/${ids.booked}`, { sub: subs[0]!, clinic: a });
    expect(res.status).toBe(200);
    const body = (await res.json()) as J;
    expect(body.call.id).toBe(ids.booked);
    expect(body.turns).toEqual([]);
    expect(body.callbacks).toEqual([]);
    const x = await call("GET", `/calls/${ids.other}`, { sub: subs[0]!, clinic: a });
    expect(x.status).toBe(404);
    expect(((await x.json()) as J).error.code).toBe("not_found");
  });

  it("GET /calls/:id never returns tool arguments or results, only a status", async () => {
    await db.insert(schema.callTurns).values([
      {
        id: newId("turn"),
        clinicId: a,
        callId: ids.booked!,
        seq: 0,
        role: "tool",
        toolName: "request_callback",
        toolArgs: { phone: "9876543210", reason: "pain" },
        toolResult: { ok: true, phone: "+919876543210" },
      },
      {
        id: newId("turn"),
        clinicId: a,
        callId: ids.booked!,
        seq: 1,
        role: "tool",
        toolName: "book_appointment",
        toolArgs: { patient_phone: "9123456780" },
        toolResult: { error: "slot_taken" },
      },
    ]);
    const res = await call("GET", `/calls/${ids.booked}`, { sub: subs[0]!, clinic: a });
    const text = await res.text();
    expect(text).not.toContain("toolArgs");
    expect(text).not.toContain("toolResult");
    expect(text).not.toMatch(/\d{10}/);
    const body = JSON.parse(text) as J;
    expect(body.turns.map((t: J) => [t.toolName, t.toolStatus])).toEqual([
      ["request_callback", "ok"],
      ["book_appointment", "error"],
    ]);
    await db.delete(schema.callTurns).where(eq(schema.callTurns.callId, ids.booked!));
  });

  it("recording-url by state", async () => {
    const get = (id: string, sub = subs[0]!, clinic = a) =>
      call("GET", `/calls/${id}/recording-url`, { sub, clinic });
    const ok = await get(ids.ready!);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({
      url: `fake://clinics/${a}/calls/r.ogg?ttl=600`,
      expiresInS: 600,
    });
    const pending = await get(ids.pending!);
    expect(pending.status).toBe(409);
    expect(((await pending.json()) as J).error.code).toBe("recording_pending");
    expect((await get(ids.none!)).status).toBe(404);
    expect((await get(ids.failed!)).status).toBe(404);
    expect((await get(ids.other!)).status).toBe(404);
    expect(blobs.presigned).toEqual([`fake://clinics/${a}/calls/r.ogg?ttl=600`]);
  });

  it("recording-url is 503 when storage is unavailable", async () => {
    const noStore = createApp({ version: "t", db, verifier: createDevVerifier(), blobs: null });
    const res = await noStore.request(`/v1/calls/${ids.ready}/recording-url`, {
      headers: { Authorization: `Bearer ${tok(subs[0]!)}`, "X-Clinic-Id": a },
    });
    expect(res.status).toBe(503);
    expect(((await res.json()) as J).error.code).toBe("storage_unavailable");
  });

  it("PATCH outcome updates the call and writes an audit row", async () => {
    const res = await call("PATCH", `/calls/${ids.info}`, {
      sub: subs[0]!,
      clinic: a,
      body: { outcome: "callback" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as J;
    expect(body.call.outcome).toBe("callback");
    expect(body.call.outcomeSource).toBe("staff");
    const rows = await db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, ids.info!));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.action).toBe("call.outcome.edit");
    const [u] = await db.select().from(schema.users).where(eq(schema.users.cognitoSub, subs[0]!));
    expect(rows[0]!.actorId).toBe(u!.id);
    expect(
      (
        await call("PATCH", `/calls/${ids.info}`, {
          sub: subs[0]!,
          clinic: a,
          body: { outcome: "x" },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call("PATCH", `/calls/${ids.other}`, {
          sub: subs[0]!,
          clinic: a,
          body: { outcome: "info" },
        })
      ).status,
    ).toBe(404);
  });
});
