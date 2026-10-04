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
if (!reachable) console.warn("WARNING: Postgres unreachable, skipping callbacks tests.");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
const run = newId("t").slice(-8).toLowerCase();
const subs = [`callbacks-a-${run}`, `callbacks-b-${run}`];
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

d("callback routes", () => {
  let a = "";
  let b = "";
  let open1 = "";
  let done1 = "";
  let foreign = "";
  beforeAll(async () => {
    a = await mkClinic(subs[0]!, "CbA");
    b = await mkClinic(subs[1]!, "CbB");
    const ins = async (clinicId: string, status: "open" | "done") => {
      const id = newId("cb");
      await db.insert(schema.callbacks).values({
        id,
        clinicId,
        phone: "+919876543210",
        reason: "wants a call",
        status,
        ...(status === "done" ? { doneAt: new Date() } : {}),
      });
      return id;
    };
    open1 = await ins(a, "open");
    done1 = await ins(a, "done");
    foreign = await ins(b, "open");
  });

  it("lists with masked phones and status filter", async () => {
    const list = async (qs: string) =>
      (await (await call("GET", `/callbacks${qs}`, { sub: subs[0]!, clinic: a })).json()) as J;
    const open = await list("");
    expect(open.total).toBe(1);
    expect(open.callbacks[0].id).toBe(open1);
    expect(open.callbacks[0].phoneMasked).toBe("+91 •••• ••3210");
    expect(open.callbacks[0]).not.toHaveProperty("phone");
    expect((await list("?status=done")).callbacks[0].id).toBe(done1);
    expect((await list("?status=all")).total).toBe(2);
    expect(JSON.stringify(await list("?status=all"))).not.toContain("9876543210");
    expect((await call("GET", "/callbacks?status=x", { sub: subs[0]!, clinic: a })).status).toBe(
      400,
    );
  });

  it("PATCH done sets doneAt, reopen clears it, cross-tenant is 404", async () => {
    const res = await call("PATCH", `/callbacks/${open1}`, {
      sub: subs[0]!,
      clinic: a,
      body: { status: "done", note: "called back" },
    });
    expect(res.status).toBe(200);
    const { callback } = (await res.json()) as J;
    expect(callback.status).toBe("done");
    expect(callback.doneAt).toBeTruthy();
    expect(callback.note).toBe("called back");
    expect(callback).not.toHaveProperty("phone");
    expect(callback.phoneMasked).toBe("+91 •••• ••3210");
    const re = await call("PATCH", `/callbacks/${open1}`, {
      sub: subs[0]!,
      clinic: a,
      body: { status: "open" },
    });
    expect(((await re.json()) as J).callback.doneAt).toBeNull();
    expect(
      (
        await call("PATCH", `/callbacks/${foreign}`, {
          sub: subs[0]!,
          clinic: a,
          body: { status: "done" },
        })
      ).status,
    ).toBe(404);
    expect(
      (await call("PATCH", `/callbacks/${open1}`, { sub: subs[0]!, clinic: a, body: {} })).status,
    ).toBe(400);
  });
});
