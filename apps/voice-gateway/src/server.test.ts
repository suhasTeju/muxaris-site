import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { createClinicForUser, loadDemoClinicData, upsertUser, usageMonth } from "@muxaris/core";
import { createDb, newId, schema, type Db } from "@muxaris/db";
import { desc, eq } from "drizzle-orm";
import type { PostCallMessage } from "@muxaris/shared";
import { callKeys } from "@muxaris/storage";
import { FakeBlobStore, FakeQueue } from "@muxaris/storage/fakes";
import { DISCLOSURE, DISCLOSURE_RECORDED } from "./session/prompt.js";
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

function connect(
  port: number,
  path = "/v1/session",
  headers?: Record<string, string>,
  opts: { autoPong?: boolean } = {},
): Client {
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`, { headers: headers ?? {}, ...opts });
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
const closeServer = async (s: ReturnType<typeof createServer>) => {
  await s.shutdown().catch(() => undefined);
  await new Promise<void>((r) => s.close(() => r()));
};

/** Polls `fn` until it returns a truthy value, or fails after the deadline. */
async function until<T>(
  fn: () => Promise<T | false | undefined> | T | false | undefined,
  ms = 5000,
) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error("until: deadline exceeded");
    await new Promise((r) => setTimeout(r, 25));
  }
}

(reachable ? describe : describe.skip)("voice-gateway /v1/session", () => {
  let clinicId = "";
  let ownerId = "";
  const tag = newId("usr").slice(4);
  const member = `dev:member-${tag}:member-${tag}@example.test`;
  const stranger = `dev:stranger-${tag}:stranger-${tag}@example.test`;
  let servers: Array<ReturnType<typeof createServer>> = [];
  let clients: Client[] = [];
  let plan: { id: string; maxConcurrentCalls: number; includedCallMinutes: number };

  async function start(extra: Partial<Parameters<typeof createServer>[0]> = {}) {
    const server = createServer({
      version: "test",
      db: db as Db,
      env: baseEnv,
      providers: { stt: new FakeStt(), tts: new FakeTts(), llm: new FakeLlm() },
      startTimeoutMs: 300,
      log: { info() {}, warn() {}, error() {} },
      ...extra,
    });
    servers.push(server);
    return { server, port: await listen(server) };
  }
  const dial = (
    port: number,
    path?: string,
    headers?: Record<string, string>,
    opts?: { autoPong?: boolean },
  ) => {
    const c = connect(port, path, headers, opts);
    clients.push(c);
    return c;
  };
  const open = async (port: number) => {
    const c = dial(port);
    await opened(c);
    return c;
  };
  const ledger = () =>
    db.select().from(schema.usageLedger).where(eq(schema.usageLedger.clinicId, clinicId));

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
  afterEach(async () => {
    for (const c of clients) c.ws.terminate();
    await Promise.all(clients.map((c) => c.closed));
    // shutdown() waits for every live call to settle (call row + ledger + slot).
    await Promise.all(servers.map(closeServer));
    clients = [];
    servers = [];
    await db.delete(schema.usageLedger).where(eq(schema.usageLedger.clinicId, clinicId));
    await db
      .update(schema.plans)
      .set({ maxConcurrentCalls: plan.maxConcurrentCalls })
      .where(eq(schema.plans.id, plan.id));
  });
  afterAll(async () => {
    try {
      await db
        .update(schema.plans)
        .set({ maxConcurrentCalls: plan.maxConcurrentCalls })
        .where(eq(schema.plans.id, plan.id));
      await Promise.all(servers.map(closeServer));
      await db.delete(schema.clinics).where(eq(schema.clinics.id, clinicId));
      await db.delete(schema.users).where(eq(schema.users.id, ownerId));
    } finally {
      await pool.end();
    }
  });

  const startFrame = (token: string, extra: object = {}, cid = clinicId) =>
    JSON.stringify({ type: "start", token, clinicId: cid, ...extra });
  const end = (c: Client) => c.ws.send(JSON.stringify({ type: "end" }));

  it("serves /healthz", async () => {
    const { port } = await start();
    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(await res.json()).toEqual({
      ok: true,
      service: "voice-gateway",
      version: "test",
      provider: "mock",
    });
  });

  it("closes 4001 when no start frame arrives in time", async () => {
    const { port } = await start();
    const c = dial(port);
    expect((await c.closed).code).toBe(4001);
    expect(c.events[0]).toMatchObject({ type: "error", code: "auth_failed" });
  });

  it("ignores a token in the URL query string", async () => {
    const { port } = await start();
    const c = dial(port, `/v1/session?token=${encodeURIComponent(member)}&clinicId=${clinicId}`);
    expect((await c.closed).code).toBe(4001);
    expect(c.events[0]).toMatchObject({ type: "error", code: "auth_failed" });
  });

  it("rejects a first frame that is not a start message", async () => {
    const { port } = await start();
    const c = await open(port);
    end(c);
    expect((await c.closed).code).toBe(4001);
  });

  it("sends auth_failed + 4001 for an invalid token", async () => {
    const { port } = await start();
    const c = await open(port);
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
    const c = await open(port);
    c.ws.send(startFrame("whatever"));
    expect((await c.closed).code).toBe(1011);
    expect(c.events[0]).toMatchObject({ type: "error", code: "provider" });
  });

  it("closes 1011 when setup (a hung verifier) exceeds the setup deadline", async () => {
    const { port } = await start({
      setupTimeoutMs: 300,
      verifier: { verify: () => new Promise(() => undefined) },
    });
    const c = await open(port);
    c.ws.send(startFrame("whatever"));
    expect((await c.closed).code).toBe(1011);
    expect(c.events[0]).toMatchObject({ type: "error", code: "internal" });
  });

  it("sends forbidden + 4003 for a non-member, without creating a user row", async () => {
    const { port } = await start();
    const c = await open(port);
    c.ws.send(startFrame(stranger));
    expect((await c.closed).code).toBe(4003);
    expect(c.events[0]).toMatchObject({ type: "error", code: "forbidden" });
    const rows = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.cognitoSub, `stranger-${tag}`));
    expect(rows).toHaveLength(0);
  });

  it("sends forbidden + 4003 for a nonexistent clinic id", async () => {
    const { port } = await start();
    const c = await open(port);
    c.ws.send(startFrame(member, {}, "cl_doesnotexist"));
    expect((await c.closed).code).toBe(4003);
    expect(c.events[0]).toMatchObject({ code: "forbidden" });
  });

  it("rejects a language the clinic has not enabled", async () => {
    const { port } = await start();
    const c = await open(port);
    c.ws.send(startFrame(member, { language: "ta-IN" }));
    expect((await c.closed).code).toBe(4003);
    expect(c.events[0]).toMatchObject({ code: "forbidden" });
  });

  it("rejects a disallowed Origin", async () => {
    const { port } = await start();
    const bad = dial(port, "/v1/session", { origin: "https://evil.example" });
    const err = await new Promise<Error>((r) => bad.ws.once("error", r));
    expect(err.message).toMatch(/403/);
  });

  it("closes the socket when a frame exceeds maxPayload", async () => {
    const { port } = await start();
    const c = await open(port);
    c.ws.send(Buffer.alloc(128 * 1024));
    expect((await c.closed).code).toBe(1009);
  });

  it("refuses unauthenticated connections over 2x MAX_SESSIONS with 503 at upgrade, and frees them on close", async () => {
    const { port } = await start({ env: { ...baseEnv, maxSessions: 1 }, startTimeoutMs: 10_000 });
    const a = await open(port);
    const b = await open(port);
    const over = dial(port);
    const err = await new Promise<Error>((r) => over.ws.once("error", r));
    expect(err.message).toMatch(/503/);
    a.ws.close();
    b.ws.close();
    await Promise.all([a.closed, b.closed]);
    // both pre-auth slots (and their timers) are released: new connections are accepted again
    await until(async () => {
      const c = dial(port);
      await opened(c).catch(() => undefined);
      c.ws.send(startFrame("not-a-token"));
      const { code } = await c.closed;
      return code === 4001;
    });
  });

  it("closes 1009 for an oversized first frame without parsing it", async () => {
    const { port } = await start();
    const c = await open(port);
    c.ws.send(JSON.stringify({ type: "start", token: "x".repeat(9 * 1024), clinicId }));
    expect((await c.closed).code).toBe(1009);
  });

  it("closes 1009 when a client streams more than 256 KiB during setup, and frees the slot", async () => {
    const { createDevVerifier } = await import("@muxaris/core");
    const dev = createDevVerifier();
    await db
      .update(schema.plans)
      .set({ maxConcurrentCalls: 1 })
      .where(eq(schema.plans.id, plan.id));
    const { port } = await start({
      verifier: {
        verify: async (t) => {
          await new Promise((r) => setTimeout(r, 400));
          return dev.verify(t);
        },
      },
    });
    const c = await open(port);
    c.ws.send(startFrame(member));
    for (let i = 0; i < 6; i++) c.ws.send(Buffer.alloc(60 * 1024));
    expect((await c.closed).code).toBe(1009);
    // the abandoned setup must not hold the (1-call) slot
    const ok = await until(async () => {
      const d = await open(port);
      d.ws.send(startFrame(member));
      const first = (await Promise.race([
        d.waitFor((e) => e.type === "ready" || e.type === "error"),
        d.closed,
      ])) as { type?: string };
      return first.type === "ready";
    });
    expect(ok).toBe(true);
  });

  it("releases the slot when createCall hangs past the setup deadline", async () => {
    await db
      .update(schema.plans)
      .set({ maxConcurrentCalls: 1 })
      .where(eq(schema.plans.id, plan.id));
    let hang = true;
    const hungDb = new Proxy(db, {
      get(t, p) {
        if (p === "insert" && hang) {
          return () => ({ values: () => ({ returning: () => new Promise(() => undefined) }) });
        }
        const v = Reflect.get(t, p, t);
        return typeof v === "function" ? v.bind(t) : v;
      },
    }) as Db;
    const { port } = await start({ db: hungDb, setupTimeoutMs: 300 });
    const c = await open(port);
    c.ws.send(startFrame(member));
    expect((await c.closed).code).toBe(1011);
    hang = false;
    const d = await open(port);
    d.ws.send(startFrame(member));
    await d.waitFor((e) => e.type === "ready");
  });

  it("releases the slot and closes the call row when session construction throws", async () => {
    await db
      .update(schema.plans)
      .set({ maxConcurrentCalls: 1 })
      .where(eq(schema.plans.id, plan.id));
    let broken = true;
    const providers = {
      get stt(): FakeStt {
        if (broken) throw new Error("boom");
        return new FakeStt();
      },
      tts: new FakeTts(),
      llm: new FakeLlm(),
    };
    const { port } = await start({ providers });
    const c = await open(port);
    c.ws.send(startFrame(member));
    expect((await c.closed).code).toBe(1011);
    broken = false;
    const [row] = await until(async () => {
      const rows = await db
        .select()
        .from(schema.calls)
        .where(eq(schema.calls.clinicId, clinicId))
        .orderBy(desc(schema.calls.startedAt))
        .limit(1);
      return rows[0]?.status === "failed" ? rows : null;
    });
    expect(row!.outcome).toBe("abandoned");
    const d = await open(port);
    d.ws.send(startFrame(member));
    await d.waitFor((e) => e.type === "ready"); // the 1-call slot was released
  });

  it("terminates a client that stops answering heartbeat pings", async () => {
    const { port } = await start({ heartbeatMs: 40, startTimeoutMs: 10_000 });
    const c = dial(port, "/v1/session", undefined, { autoPong: false });
    const t0 = Date.now();
    expect((await c.closed).code).toBe(1006);
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it("settles a call (usage, row, slot) via the backstop when the session never closes out", async () => {
    await db
      .update(schema.plans)
      .set({ maxConcurrentCalls: 1 })
      .where(eq(schema.plans.id, plan.id));
    let hang = false;
    const hangChain: unknown = new Proxy(function () {}, {
      get: (_t, k) => (k === "then" ? () => undefined : hangChain),
      apply: () => hangChain,
    });
    const hungDb = new Proxy(db, {
      get(t, p) {
        if (p === "select" && hang) return () => hangChain;
        const v = Reflect.get(t, p, t);
        return typeof v === "function" ? v.bind(t) : v;
      },
    }) as Db;
    const stt = new FakeStt();
    const { port } = await start({
      db: hungDb,
      closeGraceMs: 100,
      providers: {
        // Once STT opens the session persists its first turn, which now hangs forever.
        stt: {
          open: async () => {
            hang = true;
            return stt.open();
          },
        },
        tts: new FakeTts(),
        llm: new FakeLlm(),
      },
    });
    const a = await open(port);
    a.ws.send(startFrame(member));
    const ready = await a.waitFor((e) => e.type === "ready");
    await until(async () => hang);
    a.ws.terminate();
    await a.closed;
    await until(async () => (await ledger())[0]?.calls === 1);
    const [call] = await db
      .select()
      .from(schema.calls)
      .where(eq(schema.calls.id, ready.callId as string));
    expect(call!.status).toBe("failed");
    hang = false;
    const b = await open(port);
    b.ws.send(startFrame(member));
    await b.waitFor((e) => e.type === "ready");
  });

  it("runs a full call: ready, state events, end, ledger and call row updated", async () => {
    const { port } = await start();
    const month = usageMonth("Asia/Kolkata");
    const c = await open(port);
    c.ws.send(startFrame(member));
    const ready = await c.waitFor((e) => e.type === "ready");
    expect(ready).toMatchObject({ language: "en-IN" });
    const callId = ready.callId as string;
    for (let i = 0; i < 10; i++) c.ws.send(Buffer.alloc(3200));
    await c.waitFor((e) => e.type === "state");
    end(c);
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
    const row = await until(async () => (await ledger())[0]);
    expect(row.calls).toBe(1);
    expect(row.month).toBe(month);
    expect(row.callSeconds).toBe(call!.durationS);
    // ready.greeting is exactly what is spoken and persisted as turn 0
    const [turn0] = await db
      .select()
      .from(schema.callTurns)
      .where(eq(schema.callTurns.callId, callId))
      .orderBy(schema.callTurns.seq)
      .limit(1);
    expect(ready.greeting).toBe(turn0!.text);
  });

  it("does not lose an `end` sent while setup is still running", async () => {
    const { createDevVerifier } = await import("@muxaris/core");
    const dev = createDevVerifier();
    const { port } = await start({
      verifier: {
        verify: async (t) => {
          await new Promise((r) => setTimeout(r, 150));
          return dev.verify(t);
        },
      },
    });
    const c = await open(port);
    c.ws.send(startFrame(member));
    end(c);
    const ended = await c.waitFor((e) => e.type === "ended");
    expect(ended).toMatchObject({ reason: "caller" });
  });

  it("rejects a second concurrent session with busy + 4029 (per clinic) and frees the slot", async () => {
    await db
      .update(schema.plans)
      .set({ maxConcurrentCalls: 1 })
      .where(eq(schema.plans.id, plan.id));
    const { port } = await start();
    const a = await open(port);
    a.ws.send(startFrame(member));
    await a.waitFor((e) => e.type === "ready");
    const b = await open(port);
    b.ws.send(startFrame(member));
    expect((await b.closed).code).toBe(4029);
    expect(b.events[0]).toMatchObject({ type: "error", code: "busy" });
    end(a);
    await a.closed;
    // slot is released after the first call settles
    await until(async () => {
      const c = await open(port);
      c.ws.send(startFrame(member));
      const first = await Promise.race([
        c.waitFor((e) => e.type === "ready" || e.type === "error"),
        c.closed,
      ]);
      if ((first as { type?: string }).type === "ready") {
        end(c);
        return true;
      }
      return false;
    });
  });

  it("releases the slot and records usage when the socket drops abruptly", async () => {
    await db
      .update(schema.plans)
      .set({ maxConcurrentCalls: 1 })
      .where(eq(schema.plans.id, plan.id));
    const { port } = await start();
    const a = await open(port);
    a.ws.send(startFrame(member));
    const ready = await a.waitFor((e) => e.type === "ready");
    a.ws.terminate();
    await a.closed;
    await until(async () => (await ledger())[0]?.calls === 1);
    const [call] = await db
      .select()
      .from(schema.calls)
      .where(eq(schema.calls.id, ready.callId as string));
    expect(call!.status).not.toBe("in_progress");
    const b = await until(async () => {
      const c = await open(port);
      c.ws.send(startFrame(member));
      const first = (await Promise.race([
        c.waitFor((e) => e.type === "ready" || e.type === "error"),
        c.closed,
      ])) as { type?: string };
      return first.type === "ready" ? c : false;
    });
    expect(b).toBeTruthy();
  });

  it("rejects with busy + 4029 when the global session cap is reached", async () => {
    const { port } = await start({ env: { ...baseEnv, maxSessions: 1 } });
    const a = await open(port);
    a.ws.send(startFrame(member));
    await a.waitFor((e) => e.type === "ready");
    const b = await open(port);
    b.ws.send(startFrame(member));
    expect((await b.closed).code).toBe(4029);
    expect(b.events[0]).toMatchObject({ code: "busy" });
  });

  async function setUsed(seconds: number) {
    const month = usageMonth("Asia/Kolkata");
    await db
      .insert(schema.usageLedger)
      .values({ clinicId, month, callSeconds: seconds, calls: 1 })
      .onConflictDoUpdate({
        target: [schema.usageLedger.clinicId, schema.usageLedger.month],
        set: { callSeconds: seconds },
      });
  }

  it("ready.secondsRemaining is the per-call cap when the plan quota is larger", async () => {
    await setUsed(0);
    const { port } = await start({ env: { ...baseEnv, maxCallSeconds: 600 } });
    const c = await open(port);
    c.ws.send(startFrame(member));
    const ready = await c.waitFor((e) => e.type === "ready");
    expect(plan.includedCallMinutes * 60).toBeGreaterThan(600);
    expect(ready.secondsRemaining).toBe(600);
    expect(ready.planSecondsRemaining).toBeUndefined();
  });

  it("a plan with 90 seconds left still allows a call capped only by MAX_CALL_SECONDS", async () => {
    await setUsed(plan.includedCallMinutes * 60 - 90);
    const { port } = await start({ env: { ...baseEnv, maxCallSeconds: 600 } });
    const c = await open(port);
    c.ws.send(startFrame(member));
    const ready = await c.waitFor((e) => e.type === "ready");
    expect(ready.secondsRemaining).toBe(600);
    expect(ready.planSecondsRemaining).toBe(90);
  });

  it("rejects with quota + 4029 when the month's minutes are used up", async () => {
    const month = usageMonth("Asia/Kolkata");
    await db
      .insert(schema.usageLedger)
      .values({ clinicId, month, callSeconds: plan.includedCallMinutes * 60, calls: 3 })
      .onConflictDoUpdate({
        target: [schema.usageLedger.clinicId, schema.usageLedger.month],
        set: { callSeconds: plan.includedCallMinutes * 60 },
      });
    const { port } = await start();
    const c = await open(port);
    c.ws.send(startFrame(member));
    expect((await c.closed).code).toBe(4029);
    expect(c.events[0]).toMatchObject({ type: "error", code: "quota" });
  });

  it("shutdown() ends live calls, records usage and releases the slot", async () => {
    const { server, port } = await start();
    const c = await open(port);
    c.ws.send(startFrame(member));
    const ready = await c.waitFor((e) => e.type === "ready");
    await c.waitFor((e) => e.type === "state");
    await server.shutdown();
    expect(c.events.find((e) => e.type === "ended")).toMatchObject({
      type: "ended",
      reason: "server_shutdown",
    });
    await c.closed;
    const [call] = await db
      .select()
      .from(schema.calls)
      .where(eq(schema.calls.id, ready.callId as string));
    expect(call!.status).toBe("completed");
    expect((await ledger())[0]?.calls).toBe(1);
    // new connections are refused after shutdown
    await expect(
      new Promise((resolve, reject) => {
        const w = new WebSocket(`ws://127.0.0.1:${port}/v1/session`);
        w.on("open", () => resolve("open"));
        w.on("error", reject);
      }),
    ).rejects.toBeDefined();
  });
  describe("recording and post-call", () => {
    const callRow = async (callId: string) =>
      (await db.select().from(schema.calls).where(eq(schema.calls.id, callId)))[0]!;

    /** A call with one user turn, ended by the client; resolves with the call id. */
    async function talk(port: number, stt: FakeStt) {
      const c = await open(port);
      c.ws.send(startFrame(member));
      const ready = await c.waitFor((e) => e.type === "ready");
      await c.waitFor((e) => e.type === "state");
      c.ws.send(Buffer.alloc(3200, 1));
      stt.push({ type: "transcript", text: "hello" });
      await until(() => c.events.filter((e) => e.type === "state").length >= 2);
      return { c, ready, callId: ready.callId as string };
    }

    it("happy path leaves one transcript, one WAV and one queue message", async () => {
      const blobs = new FakeBlobStore();
      const queue = new FakeQueue<PostCallMessage>();
      const stt = new FakeStt();
      const { port } = await start({
        storage: { blobs, queue },
        providers: { stt, tts: new FakeTts(), llm: new FakeLlm() },
      });
      const { c, ready, callId } = await talk(port, stt);
      expect(String(ready.greeting).startsWith(DISCLOSURE_RECORDED["en-IN"])).toBe(true);
      end(c);
      await c.closed;
      await until(async () => (await callRow(callId)).recordingStatus === "ready");
      const wav = blobs.objects.get(callKeys.recording(clinicId, callId));
      expect(wav?.contentType).toBe("audio/wav");
      expect(wav!.body.readUInt16LE(22)).toBe(2);
      expect(blobs.objects.has(callKeys.transcript(clinicId, callId))).toBe(true);
      expect(blobs.objects.size).toBe(2);
      expect(queue.sent).toHaveLength(1);
      expect(queue.sent[0]).toMatchObject({ type: "call.completed", clinicId, callId });
    });

    it("settle records the call's LLM tokens in the usage ledger", async () => {
      const stt = new FakeStt();
      const llm = new FakeLlm({}, "Okay.", 0, [
        [
          { type: "text", text: "Hi there." },
          { type: "done", stopReason: "end_turn", usage: { inputTokens: 120, outputTokens: 30 } },
        ],
      ]);
      const { port } = await start({ providers: { stt, tts: new FakeTts(), llm } });
      const { c, callId } = await talk(port, stt);
      // Let the reply finish (its turn is persisted after the LLM stream's done).
      await until(async () => {
        const turns = await db
          .select()
          .from(schema.callTurns)
          .where(eq(schema.callTurns.callId, callId));
        // The greeting is the first assistant turn; the LLM reply is the second.
        return turns.filter((t) => t.role === "assistant").length >= 2;
      });
      end(c);
      await c.closed;
      await until(async () => (await ledger())[0]?.calls === 1);
      expect((await ledger())[0]).toMatchObject({ llmInputTokens: 120, llmOutputTokens: 30 });
    });

    it("recordCalls=false in clinic settings: transcript only, plain disclosure", async () => {
      const [row] = await db.select().from(schema.clinics).where(eq(schema.clinics.id, clinicId));
      await db
        .update(schema.clinics)
        .set({ settings: { ...(row!.settings as object), recordCalls: false } })
        .where(eq(schema.clinics.id, clinicId));
      try {
        const blobs = new FakeBlobStore();
        const queue = new FakeQueue<PostCallMessage>();
        const stt = new FakeStt();
        const { port } = await start({
          storage: { blobs, queue },
          providers: { stt, tts: new FakeTts(), llm: new FakeLlm() },
        });
        const { c, ready, callId } = await talk(port, stt);
        expect(String(ready.greeting).startsWith(DISCLOSURE["en-IN"])).toBe(true);
        end(c);
        await c.closed;
        await until(() => queue.sent.length === 1);
        expect([...blobs.objects.keys()]).toEqual([callKeys.transcript(clinicId, callId)]);
        expect((await callRow(callId)).recordingStatus).toBe("none");
      } finally {
        await db
          .update(schema.clinics)
          .set({ settings: row!.settings })
          .where(eq(schema.clinics.id, clinicId));
      }
    });

    it("recorder unavailable: call works, plain disclosure, row not left pending", async () => {
      const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const dir = mkdtempSync(join(tmpdir(), "spool-bad-"));
      const file = join(dir, "file");
      writeFileSync(file, "x");
      try {
        const blobs = new FakeBlobStore();
        const queue = new FakeQueue<PostCallMessage>();
        const stt = new FakeStt();
        const { port } = await start({
          storage: { blobs, queue },
          spoolDir: join(file, "sub"),
          providers: { stt, tts: new FakeTts(), llm: new FakeLlm() },
        });
        const { c, ready, callId } = await talk(port, stt);
        expect(String(ready.greeting).startsWith(DISCLOSURE["en-IN"])).toBe(true);
        expect((await callRow(callId)).recordingStatus).not.toBe("pending");
        end(c);
        await c.closed;
        await until(() => queue.sent.length === 1);
        expect([...blobs.objects.keys()]).toEqual([callKeys.transcript(clinicId, callId)]);
        expect((await callRow(callId)).recordingStatus).toBe("none");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("no storage: nothing recorded, row stays none", async () => {
      const stt = new FakeStt();
      const { port } = await start({
        storage: { blobs: null, queue: null },
        providers: { stt, tts: new FakeTts(), llm: new FakeLlm() },
      });
      const { c, ready, callId } = await talk(port, stt);
      expect(String(ready.greeting).startsWith(DISCLOSURE["en-IN"])).toBe(true);
      end(c);
      await c.closed;
      await until(async () => (await callRow(callId)).status === "completed");
      expect((await callRow(callId)).recordingStatus).toBe("none");
    });

    it("shutdown waits for an in-flight upload", async () => {
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      class SlowBlobs extends FakeBlobStore {
        override async put(...a: Parameters<FakeBlobStore["put"]>) {
          await gate;
          return super.put(...a);
        }
      }
      const blobs = new SlowBlobs();
      const queue = new FakeQueue<PostCallMessage>();
      const stt = new FakeStt();
      const { server, port } = await start({
        storage: { blobs, queue },
        providers: { stt, tts: new FakeTts(), llm: new FakeLlm() },
        shutdownGraceMs: 5000,
      });
      const { c, callId } = await talk(port, stt);
      end(c);
      await c.closed;
      await until(async () => (await callRow(callId)).status === "completed");
      let done = false;
      const sd = server.shutdown().then(() => (done = true));
      await new Promise((r) => setTimeout(r, 300));
      expect(done).toBe(false);
      release();
      await sd;
      expect((await callRow(callId)).recordingStatus).toBe("ready");
      expect(queue.sent).toHaveLength(1);
    });

    it("aborted completion marks the row failed after the grace window", async () => {
      class HangingBlobs extends FakeBlobStore {
        override async put(): Promise<void> {
          await new Promise(() => undefined);
        }
      }
      const queue = new FakeQueue<PostCallMessage>();
      const stt = new FakeStt();
      const { server, port } = await start({
        storage: { blobs: new HangingBlobs(), queue },
        providers: { stt, tts: new FakeTts(), llm: new FakeLlm() },
        shutdownGraceMs: 300,
      });
      const { c, callId } = await talk(port, stt);
      end(c);
      await c.closed;
      await until(async () => (await callRow(callId)).status === "completed");
      await server.shutdown();
      expect((await callRow(callId)).recordingStatus).toBe("failed");
    });
  });
});
