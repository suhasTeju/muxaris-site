import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
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
  const dial = (port: number, path?: string, headers?: Record<string, string>) => {
    const c = connect(port, path, headers);
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
    expect(await res.json()).toEqual({ ok: true, service: "voice-gateway", version: "test" });
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

  it("caps unauthenticated connections at 2x MAX_SESSIONS (1013) and frees them on close", async () => {
    const { port } = await start({ env: { ...baseEnv, maxSessions: 1 }, startTimeoutMs: 10_000 });
    const a = await open(port);
    const b = await open(port);
    const over = dial(port);
    expect((await over.closed).code).toBe(1013);
    expect(over.events[0]).toMatchObject({ type: "error", code: "busy" });
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
    expect(c.events.some((e) => e.type === "ended")).toBe(true);
    await c.closed;
    const [call] = await db
      .select()
      .from(schema.calls)
      .where(eq(schema.calls.id, ready.callId as string));
    expect(call!.status).not.toBe("in_progress");
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
});
