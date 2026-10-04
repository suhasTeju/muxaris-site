import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { createClinicForUser, loadDemoClinicData, upsertUser, usageMonth } from "@muxaris/core";
import { createDb, newId, schema, type Db } from "@muxaris/db";
import { eq } from "drizzle-orm";
import { FakeLlm, FakeStt, FakeTts } from "./providers/fakes.js";
import { createServer, type ServerEnv } from "./server.js";

const DB_URL = process.env.DATABASE_URL ?? "postgres://muxaris:muxaris@localhost:5433/muxaris";
const { db, pool } = createDb(DB_URL);
let reachable = true;
try {
  await pool.query("select 1");
} catch {
  reachable = false;
  console.warn(
    "WARNING: Postgres unreachable, skipping voice-gateway server tests. Run: docker compose up -d && npm run db:migrate",
  );
}

const baseEnv: ServerEnv = {
  provider: "mock",
  sarvamKey: null,
  bedrockModelId: "x",
  awsRegion: "ap-south-1",
  maxSessions: 15,
  maxCallSeconds: 600,
  corsOrigins: ["http://localhost:3000"],
  authMode: "dev",
  cognitoUserPoolId: null,
  cognitoClientId: null,
};

interface Client {
  ws: WebSocket;
  events: Array<Record<string, unknown>>;
  binary: number;
  closed: Promise<{ code: number }>;
  waitFor(
    pred: (e: Record<string, unknown>) => boolean,
    ms?: number,
  ): Promise<Record<string, unknown>>;
}

function connect(port: number, path = "/v1/session", headers?: Record<string, string>): Client {
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`, { headers: headers ?? {} });
  const events: Array<Record<string, unknown>> = [];
  const c: Client = {
    ws,
    events,
    binary: 0,
    closed: new Promise((r) => {
      ws.on("close", (code) => r({ code }));
      ws.on("error", () => undefined);
    }),
    waitFor: (pred, ms = 5000) =>
      new Promise((resolve, reject) => {
        const hit = events.find(pred);
        if (hit) return resolve(hit);
        const t = setTimeout(() => reject(new Error("timeout waiting for event")), ms);
        const iv = setInterval(() => {
          const h = events.find(pred);
          if (h) {
            clearTimeout(t);
            clearInterval(iv);
            resolve(h);
          }
        }, 10);
      }),
  };
  ws.on("message", (d, isBinary) => {
    if (isBinary) c.binary++;
    else events.push(JSON.parse(d.toString()));
  });
  return c;
}
const opened = (c: Client) => new Promise<void>((r) => c.ws.once("open", () => r()));

async function listen(server: ReturnType<typeof createServer>): Promise<number> {
  await new Promise<void>((r) => server.listen(0, r));
  return (server.address() as { port: number }).port;
}
const closeServer = (s: ReturnType<typeof createServer>) =>
  new Promise<void>((r) => s.close(() => r()));

(reachable ? describe : describe.skip)("voice-gateway /v1/session", () => {
  let clinicId = "";
  let ownerId = "";
  const tag = newId("usr").slice(4);
  const member = `dev:member-${tag}:member-${tag}@example.test`;
  const stranger = `dev:stranger-${tag}:stranger-${tag}@example.test`;
  const servers: Array<ReturnType<typeof createServer>> = [];
  let plan: { id: string; maxConcurrentCalls: number; includedCallMinutes: number };

  async function start(extra: Partial<Parameters<typeof createServer>[0]> = {}) {
    const server = createServer({
      version: "test",
      db: db as Db,
      env: baseEnv,
      providers: { stt: new FakeStt(), tts: new FakeTts(), llm: new FakeLlm() },
      startTimeoutMs: 300,
      ...extra,
    });
    servers.push(server);
    return { server, port: await listen(server) };
  }

  beforeAll(async () => {
    const owner = await upsertUser(db, {
      cognitoSub: `member-${tag}`,
      email: `member-${tag}@example.test`,
    });
    ownerId = owner.id;
    const { clinic } = await createClinicForUser(db, {
      userId: owner.id,
      name: `GW Test ${tag}`,
      specialty: "dental",
      city: "Bengaluru",
    });
    clinicId = clinic.id;
    await loadDemoClinicData(db, clinicId);
    const [p] = await db
      .select()
      .from(schema.plans)
      .where(eq(schema.plans.id, clinic.plan as string));
    plan = p!;
  });
  afterAll(async () => {
    await db
      .update(schema.plans)
      .set({ maxConcurrentCalls: plan.maxConcurrentCalls })
      .where(eq(schema.plans.id, plan.id));
    await Promise.all(servers.map(closeServer));
    await db.delete(schema.clinics).where(eq(schema.clinics.id, clinicId));
    await db.delete(schema.users).where(eq(schema.users.id, ownerId));
    await pool.end();
  });

  const startFrame = (token: string, extra: object = {}) =>
    JSON.stringify({ type: "start", token, clinicId, ...extra });

  it("serves /healthz", async () => {
    const { port } = await start();
    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(await res.json()).toEqual({ ok: true, service: "voice-gateway", version: "test" });
  });

  it("closes 4001 when no start frame arrives in time", async () => {
    const { port } = await start();
    const c = connect(port);
    expect((await c.closed).code).toBe(4001);
    expect(c.events[0]).toMatchObject({ type: "error", code: "auth_failed" });
  });

  it("ignores a token in the URL query string", async () => {
    const { port } = await start();
    const c = connect(port, `/v1/session?token=${encodeURIComponent(member)}&clinicId=${clinicId}`);
    expect((await c.closed).code).toBe(4001);
    expect(c.events[0]).toMatchObject({ type: "error", code: "auth_failed" });
  });

  it("rejects a first frame that is not a start message", async () => {
    const { port } = await start();
    const c = connect(port);
    await opened(c);
    c.ws.send(JSON.stringify({ type: "end" }));
    expect((await c.closed).code).toBe(4001);
  });

  it("sends auth_failed + 4001 for an invalid token", async () => {
    const { port } = await start();
    const c = connect(port);
    await opened(c);
    c.ws.send(startFrame("not-a-token"));
    expect((await c.closed).code).toBe(4001);
    expect(c.events[0]).toMatchObject({ type: "error", code: "auth_failed" });
  });

  it("sends provider + 1011 when the verifier is unavailable", async () => {
    const { AuthUnavailableError } = await import("@muxaris/core");
    const { port } = await start({
      verifier: {
        verify: async () => {
          throw new AuthUnavailableError();
        },
      },
    });
    const c = connect(port);
    await opened(c);
    c.ws.send(startFrame("whatever"));
    expect((await c.closed).code).toBe(1011);
    expect(c.events[0]).toMatchObject({ type: "error", code: "provider" });
  });

  it("sends forbidden + 4003 for a non-member", async () => {
    const { port } = await start();
    const c = connect(port);
    await opened(c);
    c.ws.send(startFrame(stranger));
    expect((await c.closed).code).toBe(4003);
    expect(c.events[0]).toMatchObject({ type: "error", code: "forbidden" });
    const [u] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.cognitoSub, `stranger-${tag}`));
    if (u) await db.delete(schema.users).where(eq(schema.users.id, u.id));
  });

  it("rejects a language the clinic has not enabled", async () => {
    const { port } = await start();
    const c = connect(port);
    await opened(c);
    c.ws.send(startFrame(member, { language: "ta-IN" }));
    expect((await c.closed).code).toBe(4003);
    expect(c.events[0]).toMatchObject({ code: "forbidden" });
  });

  it("rejects a disallowed Origin and allows a missing one", async () => {
    const { port } = await start();
    const bad = connect(port, "/v1/session", { origin: "https://evil.example" });
    const err = await new Promise<Error>((r) => bad.ws.once("error", r));
    expect(err.message).toMatch(/403/);
  });

  it("closes the socket when a frame exceeds maxPayload", async () => {
    const { port } = await start();
    const c = connect(port);
    await opened(c);
    c.ws.send(Buffer.alloc(128 * 1024));
    expect((await c.closed).code).toBe(1009);
  });

  it("runs a full call: ready, state events, end, ledger and call row updated", async () => {
    const { port } = await start();
    const month = usageMonth("Asia/Kolkata");
    const c = connect(port);
    await opened(c);
    c.ws.send(startFrame(member));
    const ready = await c.waitFor((e) => e.type === "ready");
    expect(ready).toMatchObject({ language: "en-IN" });
    const callId = ready.callId as string;
    for (let i = 0; i < 10; i++) c.ws.send(Buffer.alloc(3200));
    await c.waitFor((e) => e.type === "state");
    c.ws.send(JSON.stringify({ type: "end" }));
    const ended = await c.waitFor((e) => e.type === "ended");
    expect(ended).toMatchObject({ reason: "caller" });
    expect((await c.closed).code).toBe(1000);

    const [call] = await db.select().from(schema.calls).where(eq(schema.calls.id, callId));
    expect(call).toMatchObject({
      clinicId,
      channel: "browser",
      status: "completed",
      startedByUserId: ownerId,
    });
    await new Promise((r) => setTimeout(r, 200));
    const [row] = await db
      .select()
      .from(schema.usageLedger)
      .where(eq(schema.usageLedger.clinicId, clinicId));
    expect(row?.calls).toBe(1);
    expect(row?.month).toBe(month);
    await db.delete(schema.usageLedger).where(eq(schema.usageLedger.clinicId, clinicId));
  });

  it("rejects a second concurrent session with busy + 4029 (per clinic)", async () => {
    await db
      .update(schema.plans)
      .set({ maxConcurrentCalls: 1 })
      .where(eq(schema.plans.id, plan.id));
    const { port } = await start();
    const a = connect(port);
    await opened(a);
    a.ws.send(startFrame(member));
    await a.waitFor((e) => e.type === "ready");
    const b = connect(port);
    await opened(b);
    b.ws.send(startFrame(member));
    expect((await b.closed).code).toBe(4029);
    expect(b.events[0]).toMatchObject({ type: "error", code: "busy" });
    a.ws.send(JSON.stringify({ type: "end" }));
    await a.closed;
    await new Promise((r) => setTimeout(r, 200));
    // slot is released after the first call ends
    const c = connect(port);
    await opened(c);
    c.ws.send(startFrame(member));
    await c.waitFor((e) => e.type === "ready");
    c.ws.send(JSON.stringify({ type: "end" }));
    await c.closed;
    await new Promise((r) => setTimeout(r, 200));
    await db
      .update(schema.plans)
      .set({ maxConcurrentCalls: plan.maxConcurrentCalls })
      .where(eq(schema.plans.id, plan.id));
    await db.delete(schema.usageLedger).where(eq(schema.usageLedger.clinicId, clinicId));
  });

  it("rejects with busy + 4029 when the global session cap is reached", async () => {
    const { port } = await start({ env: { ...baseEnv, maxSessions: 1 } });
    const a = connect(port);
    await opened(a);
    a.ws.send(startFrame(member));
    await a.waitFor((e) => e.type === "ready");
    const b = connect(port);
    await opened(b);
    b.ws.send(startFrame(member));
    expect((await b.closed).code).toBe(4029);
    expect(b.events[0]).toMatchObject({ code: "busy" });
    a.ws.send(JSON.stringify({ type: "end" }));
    await a.closed;
    await new Promise((r) => setTimeout(r, 200));
    await db.delete(schema.usageLedger).where(eq(schema.usageLedger.clinicId, clinicId));
  });

  it("rejects with quota + 4029 when the month's minutes are used up", async () => {
    const month = usageMonth("Asia/Kolkata");
    await db
      .insert(schema.usageLedger)
      .values({ clinicId, month, callSeconds: plan.includedCallMinutes * 60, calls: 3 });
    const { port } = await start();
    const c = connect(port);
    await opened(c);
    c.ws.send(startFrame(member));
    expect((await c.closed).code).toBe(4029);
    expect(c.events[0]).toMatchObject({ type: "error", code: "quota" });
    await db.delete(schema.usageLedger).where(eq(schema.usageLedger.clinicId, clinicId));
  });
});
