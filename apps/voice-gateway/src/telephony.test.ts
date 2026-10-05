/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import {
  createClinicForUser,
  getClinicContext,
  loadDemoClinicData,
  signStreamToken,
  upsertUser,
} from "@muxaris/core";
import { createDb, newId, schema, type Db } from "@muxaris/db";
import { eq } from "drizzle-orm";
import { FakeStt, FakeTts } from "./providers/fakes.js";
import { ScriptedLlm, call, firstOpenDay, lastToolResult } from "./session/test-helpers.js";
import { createServer, type ServerEnv } from "./server.js";
import { mulawEncode } from "./telephony/mulaw.js";

const DB_URL = process.env.DATABASE_URL ?? "postgres://muxaris:muxaris@localhost:5433/muxaris";
const { db, pool } = createDb(DB_URL);
let reachable = true;
try {
  await pool.query("select 1");
} catch {
  reachable = false;
  console.warn("WARNING: Postgres unreachable, skipping voice-gateway telephony tests.");
}

const SECRET = "test-stream-secret";
const env = (provider: "none" | "twilio"): ServerEnv => ({
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
  telephony: { provider, streamSecret: provider === "none" ? null : SECRET },
});

const until = async <T>(fn: () => Promise<T | false | undefined> | T | false | undefined) => {
  const end = Date.now() + 8000;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error("until: deadline exceeded");
    await new Promise((r) => setTimeout(r, 25));
  }
};

(reachable ? describe : describe.skip)("voice-gateway /v1/telephony/twilio", () => {
  let clinicId = "";
  let ownerId = "";
  const tag = newId("usr").slice(4);
  let servers: Array<ReturnType<typeof createServer>> = [];
  let sockets: WebSocket[] = [];

  async function start(
    opts: { provider?: "none" | "twilio"; stt?: FakeStt; llm?: ScriptedLlm } = {},
  ) {
    const server = createServer({
      version: "test",
      db: db as Db,
      env: env(opts.provider ?? "twilio"),
      providers: {
        stt: opts.stt ?? new FakeStt(),
        tts: new FakeTts(),
        llm: (opts.llm ?? new ScriptedLlm([() => [{ type: "text", text: "Okay." }]])) as never,
      },
      startTimeoutMs: 400,
      log: { info() {}, warn() {}, error() {} },
    });
    servers.push(server);
    await new Promise<void>((r) => server.listen(0, r));
    return (server.address() as { port: number }).port;
  }

  function phone(port: number) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/v1/telephony/twilio`);
    sockets.push(ws);
    const frames: Array<Record<string, any>> = [];
    ws.on("message", (d) => frames.push(JSON.parse(d.toString())));
    const closed = new Promise<number>((r) => {
      ws.on("close", (code) => r(code));
      ws.on("error", () => undefined);
    });
    const opened = new Promise<void>((r) => ws.once("open", () => r()));
    const begin = async (token: string, callSid = "CA1", from = "+910000000000") => {
      await opened;
      ws.send(JSON.stringify({ event: "connected", protocol: "Call", version: "1.0.0" }));
      ws.send(
        JSON.stringify({
          event: "start",
          streamSid: "MZ1",
          start: { streamSid: "MZ1", callSid, customParameters: { token, from } },
        }),
      );
    };
    return { ws, frames, closed, begin };
  }

  const mint = (over: Partial<{ callSid: string; exp: number; secret: string }> = {}) =>
    signStreamToken(over.secret ?? SECRET, {
      callSid: over.callSid ?? "CA1",
      clinicId,
      from: "+919876500777",
      exp: over.exp ?? Math.floor(Date.now() / 1000) + 300,
    });
  const callRows = () => db.select().from(schema.calls).where(eq(schema.calls.clinicId, clinicId));

  beforeAll(async () => {
    const owner = await upsertUser(db, {
      cognitoSub: `tel-${tag}`,
      email: `tel-${tag}@example.test`,
    });
    ownerId = owner.id;
    const { clinic } = await createClinicForUser(db, {
      userId: owner.id,
      name: `Tel Test ${tag}`,
      specialty: "dental",
      city: "Bengaluru",
    });
    clinicId = clinic.id;
    await loadDemoClinicData(db, clinicId);
  });
  afterEach(async () => {
    for (const s of sockets) s.terminate();
    sockets = [];
    await Promise.all(
      servers.map(async (s) => {
        await s.shutdown().catch(() => undefined);
        await new Promise<void>((r) => s.close(() => r()));
      }),
    );
    servers = [];
    await db.delete(schema.appointments).where(eq(schema.appointments.clinicId, clinicId));
    await db.delete(schema.calls).where(eq(schema.calls.clinicId, clinicId));
    await db.delete(schema.usageLedger).where(eq(schema.usageLedger.clinicId, clinicId));
  });
  afterAll(async () => {
    try {
      await db.delete(schema.clinics).where(eq(schema.clinics.id, clinicId));
      await db.delete(schema.users).where(eq(schema.users.id, ownerId));
    } finally {
      await pool.end();
    }
  });

  it("runs a scripted phone call that books a slot and records channel=phone", async () => {
    const ctx = await getClinicContext(db, clinicId);
    const { date } = await firstOpenDay(db, ctx, new Date());
    const llm = new ScriptedLlm([
      () => [call("t1", "get_clinic_info", {})],
      (m: any) => [
        call("t2", "find_slots", { date, service_id: lastToolResult(m)["services"][0].id }),
      ],
      (m: any) => {
        const slot = lastToolResult(m)["slots"][0];
        return [
          call("t3", "book_appointment", {
            patient_name: "Phone Patient",
            patient_phone: "+919876500777", // must match the caller id (verified-phone rule),
            doctor_id: slot.doctor_id,
            service_id: ctx.services.find((s) => s.bookableByAi)!.id,
            starts_at: slot.starts_at,
          }),
        ];
      },
      () => [{ type: "text", text: "Booked." }],
    ]);
    const stt = new FakeStt();
    const port = await start({ stt, llm });
    const p = phone(port);
    await p.begin(mint());
    // The greeting is spoken back as 160-byte-or-less μ-law media frames.
    await until(() => p.frames.some((f) => f.event === "media"));
    const first = p.frames.find((f) => f.event === "media")!;
    expect(first.streamSid).toBe("MZ1");
    expect(Buffer.from(first.media.payload, "base64").length).toBeLessThanOrEqual(160);
    // Wait for the greeting to finish playing (no new frames for a moment) before the caller speaks.
    let seen = -1;
    await until(async () => {
      if (p.frames.length === seen) return true;
      seen = p.frames.length;
      await new Promise((r) => setTimeout(r, 150));
      return false;
    });
    const mu = Buffer.from(mulawEncode(new Int16Array(160).fill(500))).toString("base64");
    p.ws.send(JSON.stringify({ event: "media", media: { payload: mu } }));
    stt.push({ type: "speech_start" });
    stt.push({ type: "speech_end" });
    stt.push({ type: "transcript", text: "book me a cleaning", language: "en-IN" });
    await until(async () => {
      const a = await db
        .select()
        .from(schema.appointments)
        .where(eq(schema.appointments.clinicId, clinicId));
      return a.length === 1;
    });
    const rows = await callRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ channel: "phone", callerPhone: "+919876500777" });
    p.ws.send(JSON.stringify({ event: "stop" }));
    await p.closed;
    await until(async () => (await callRows())[0]?.status !== "in_progress");
  });

  it("rejects a bad, forged or expired token with 4001 and creates no call", async () => {
    const port = await start();
    for (const token of [
      "garbage",
      mint({ secret: "other-secret" }),
      mint({ exp: Math.floor(Date.now() / 1000) - 10 }),
      mint({ callSid: "CA-other" }), // minted for a different call
    ]) {
      const p = phone(port);
      await p.begin(token);
      expect(await p.closed).toBe(4001);
    }
    expect(await callRows()).toHaveLength(0);
  });

  it("closes 4001 when Twilio never sends start", async () => {
    const port = await start();
    const p = phone(port);
    expect(await p.closed).toBe(4001);
    expect(await callRows()).toHaveLength(0);
  });

  it("refuses the phone path entirely when telephony is off", async () => {
    const port = await start({ provider: "none" });
    const p = phone(port);
    await expect(p.closed.then(() => "closed")).resolves.toBe("closed");
    expect(p.ws.readyState).toBe(WebSocket.CLOSED);
    expect(await callRows()).toHaveLength(0);
  });
});
