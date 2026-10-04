import http from "node:http";
import {
  AuthUnavailableError,
  createCall,
  finishCall,
  getClinicContext,
  getMembership,
  getUserByCognitoSub,
  getPlanForClinic,
  getUsedCallSeconds,
  recordCallUsage,
  usageMonth,
  type TokenVerifier,
} from "@muxaris/core";
import type { Db } from "@muxaris/db";
import {
  clientEventSchema,
  LANGUAGE_CODES,
  type GatewayEvent,
  type LanguageCode,
} from "@muxaris/shared";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { createVerifier } from "./auth.js";
import type { VoiceEnv } from "./env.js";
import { BedrockLlm } from "./providers/bedrock-llm.js";
import { FakeLlm, FakeStt, FakeTts } from "./providers/fakes.js";
import { SarvamStt } from "./providers/sarvam-stt.js";
import { SarvamTts } from "./providers/sarvam-tts.js";
import type { LlmProvider, SttProvider, TtsProvider } from "./providers/types.js";
import { openingUtterances } from "./session/prompt.js";
import { VoiceSession, type SessionLogger } from "./session/voice-session.js";
import { WsTransport } from "./ws-transport.js";

export interface Providers {
  stt: SttProvider;
  tts: TtsProvider;
  llm: LlmProvider;
}

export type ServerEnv = Pick<
  VoiceEnv,
  | "provider"
  | "sarvamKey"
  | "bedrockModelId"
  | "awsRegion"
  | "maxSessions"
  | "maxCallSeconds"
  | "corsOrigins"
  | "authMode"
  | "cognitoUserPoolId"
  | "cognitoClientId"
>;

export interface ServerDeps {
  version: string;
  db: Db;
  env: ServerEnv;
  providers?: Providers;
  verifier?: TokenVerifier;
  log?: SessionLogger;
  now?: () => Date;
  /** Test seams. */
  startTimeoutMs?: number;
  /** Whole-setup deadline (first frame + verify + DB + createCall), ms. */
  setupTimeoutMs?: number;
  /** Max time shutdown() waits for live calls to finish, ms. */
  shutdownGraceMs?: number;
  /** Max time to wait for a session to finish after the socket closed, ms. */
  closeGraceMs?: number;
  heartbeatMs?: number;
}

const START_TIMEOUT_MS = 5000;
const SETUP_TIMEOUT_MS = 10_000;
const SHUTDOWN_GRACE_MS = 10_000;
const CLOSE_GRACE_MS = 5000;
const HEARTBEAT_MS = 20_000;
const MAX_MISSED_PONGS = 2;
const MAX_PAYLOAD = 64 * 1024;
/** The `start` frame is tiny; anything bigger is rejected before parsing. */
const MAX_START_FRAME_BYTES = 8 * 1024;
/** Frames held (per connection) between `start` and the transport being ready. */
const MAX_EARLY_BYTES = 256 * 1024;
const MAX_EARLY_FRAMES = 500;

class SetupExpired extends Error {
  constructor() {
    super("setup deadline exceeded");
    this.name = "SetupExpired";
  }
}

const rawLength = (d: RawData): number =>
  Array.isArray(d) ? d.reduce((n, b) => n + b.length, 0) : d.byteLength;

export function createProviders(env: ServerEnv): Providers {
  if (env.provider === "sarvam" && env.sarvamKey) {
    return {
      stt: new SarvamStt({ apiKey: env.sarvamKey }),
      tts: new SarvamTts({ apiKey: env.sarvamKey }),
      llm: new BedrockLlm({ modelId: env.bedrockModelId, region: env.awsRegion }),
    };
  }
  return { stt: new FakeStt(), tts: new FakeTts(), llm: new FakeLlm() };
}

export const consoleLogger: SessionLogger = {
  info: (msg, fields) => console.log(JSON.stringify({ level: "info", msg, ...fields })),
  warn: (msg, fields) => console.warn(JSON.stringify({ level: "warn", msg, ...fields })),
  error: (msg, fields) => console.error(JSON.stringify({ level: "error", msg, ...fields })),
};

/**
 * Allowlisted error fields for logs: name, code, and the first 200 chars of the message only for
 * non-database errors (drizzle/pg messages and causes can embed query params such as emails).
 */
export function safeErr(e: unknown): Record<string, unknown> {
  const err = e as { name?: string; code?: unknown; message?: string; cause?: { code?: unknown } };
  const out: Record<string, unknown> = { errName: err?.name ?? "unknown" };
  const code = err?.code ?? err?.cause?.code;
  if (code !== undefined) out.errCode = String(code);
  const isDb =
    err?.name === "DrizzleQueryError" ||
    err?.name === "DatabaseError" ||
    err?.cause?.code !== undefined;
  if (!isDb && typeof err?.message === "string") out.errMessage = err.message.slice(0, 200);
  return out;
}

function rejectWith(
  ws: WebSocket,
  code: number,
  event: Extract<GatewayEvent, { type: "error" }>["code"],
  message: string,
): void {
  if (ws.readyState !== ws.OPEN) return;
  try {
    ws.send(JSON.stringify({ type: "error", code: event, message } satisfies GatewayEvent));
    ws.close(code, event);
  } catch {
    ws.terminate();
  }
}

const CLINIC_ID_RE = /^cl_[a-z0-9]{1,40}$/;
/** Client-supplied ids are logged only when they look like ours. */
const logId = (id: string) => (CLINIC_ID_RE.test(id) ? id : "invalid");

export type GatewayServer = http.Server & { shutdown(): Promise<void> };

interface LiveCall {
  session: VoiceSession;
  /** Resolves once the call row, usage ledger and slot are settled. */
  settled: Promise<void>;
}

export function createServer(deps: ServerDeps): GatewayServer {
  const { db, env } = deps;
  const log = deps.log ?? consoleLogger;
  const now = deps.now ?? (() => new Date());
  const verifier = deps.verifier ?? createVerifier(env);
  const providers = deps.providers ?? createProviders(env);
  const startTimeoutMs = deps.startTimeoutMs ?? START_TIMEOUT_MS;
  const setupTimeoutMs = deps.setupTimeoutMs ?? SETUP_TIMEOUT_MS;
  const shutdownGraceMs = deps.shutdownGraceMs ?? SHUTDOWN_GRACE_MS;
  const closeGraceMs = deps.closeGraceMs ?? CLOSE_GRACE_MS;
  const heartbeatMs = deps.heartbeatMs ?? HEARTBEAT_MS;
  const maxPreAuth = 2 * env.maxSessions;

  let active = 0;
  let preAuth = 0;
  let shuttingDown = false;
  const perClinic = new Map<string, number>();
  const live = new Set<LiveCall>();
  const release = (clinicId: string) => {
    active = Math.max(0, active - 1);
    const n = (perClinic.get(clinicId) ?? 1) - 1;
    if (n <= 0) perClinic.delete(clinicId);
    else perClinic.set(clinicId, n);
  };

  const server = http.createServer((req, res) => {
    if (req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, service: "voice-gateway", version: deps.version }));
      return;
    }
    res.writeHead(404);
    res.end();
  }) as GatewayServer;

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_PAYLOAD,
    perMessageDeflate: false,
  });

  server.on("upgrade", (req, socket, head) => {
    const path = (req.url ?? "").split("?")[0];
    if (path !== "/v1/session") {
      socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    const origin = req.headers.origin;
    if (origin && !env.corsOrigins.includes(origin)) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    if (shuttingDown || preAuth >= maxPreAuth) {
      log.warn("upgrade refused", { reason: shuttingDown ? "shutdown" : "preauth_cap" });
      socket.write("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  wss.on("connection", (ws) => {
    ws.on("error", () => ws.terminate());
    if (shuttingDown || preAuth >= maxPreAuth) {
      log.warn("connection refused", { reason: shuttingDown ? "shutdown" : "preauth_cap" });
      rejectWith(ws, 1013, "busy", "server busy, try again later");
      return;
    }
    preAuth++;
    let preAuthHeld = true;
    const dropPreAuth = () => {
      if (preAuthHeld) {
        preAuthHeld = false;
        preAuth--;
      }
    };

    // Heartbeat: terminate after MAX_MISSED_PONGS unanswered pings.
    let missed = 0;
    ws.on("pong", () => {
      missed = 0;
    });
    const hb = setInterval(() => {
      if (missed >= MAX_MISSED_PONGS) {
        ws.terminate();
        return;
      }
      missed++;
      try {
        ws.ping();
      } catch {
        ws.terminate();
      }
    }, heartbeatMs);

    let closed = false;
    let expired = false;
    let gotStart = false;
    let resolveExpired!: () => void;
    const expiredP = new Promise<void>((r) => (resolveExpired = r));
    const expire = () => {
      expired = true;
      resolveExpired();
    };
    const startTimer = setTimeout(() => {
      ws.removeAllListeners("message");
      expire();
      rejectWith(ws, 4001, "auth_failed", "start frame not received in time");
    }, startTimeoutMs);
    // One deadline for the whole setup: first frame, verification, DB work and createCall.
    const setupTimer = setTimeout(() => {
      if (expired) return;
      expire();
      if (gotStart) {
        log.warn("setup deadline exceeded");
        rejectWith(ws, 1011, "internal", "session setup timed out");
      } else rejectWith(ws, 4001, "auth_failed", "start frame not received in time");
    }, setupTimeoutMs);
    const clearTimers = () => {
      clearTimeout(startTimer);
      clearTimeout(setupTimer);
    };
    ws.on("close", () => {
      closed = true;
      clearInterval(hb);
      clearTimers();
      dropPreAuth();
    });

    ws.once("message", (data, isBinary) => {
      clearTimeout(startTimer);
      if (expired) return;
      if (!isBinary && rawLength(data) > MAX_START_FRAME_BYTES) {
        clearTimers();
        rejectWith(ws, 1009, "internal", "start frame too large");
        return;
      }
      let parsed: ReturnType<typeof clientEventSchema.safeParse> | undefined;
      if (!isBinary) {
        try {
          parsed = clientEventSchema.safeParse(JSON.parse(data.toString()));
        } catch {
          parsed = undefined;
        }
      }
      if (!parsed?.success || parsed.data.type !== "start") {
        clearTimers();
        rejectWith(ws, 4001, "auth_failed", "first frame must be a start message");
        return;
      }
      gotStart = true;
      // Frames sent during setup (audio, `end`) are held and replayed to the transport.
      const early: Array<{ data: RawData; isBinary: boolean }> = [];
      let earlyBytes = 0;
      const hold = (d: RawData, b: boolean) => {
        earlyBytes += rawLength(d);
        if (early.length >= MAX_EARLY_FRAMES || earlyBytes > MAX_EARLY_BYTES) {
          // An unauthenticated client streaming during setup: drop the connection.
          ws.off("message", hold);
          early.length = 0;
          if (!expired) {
            expire();
            log.warn("early buffer overflow");
            rejectWith(ws, 1009, "internal", "too much data before the session was ready");
          }
          return;
        }
        early.push({ data: d, isBinary: b });
      };
      ws.on("message", hold);
      const ctl = {
        gone: () => closed || expired || shuttingDown,
        // Races a setup step against the setup deadline so a hung dependency cannot hold us.
        bound: <T>(p: Promise<T>): Promise<T> =>
          Promise.race([
            p,
            expiredP.then((): never => {
              throw new SetupExpired();
            }),
          ]),
        early,
        hold,
        done: () => {
          clearTimers();
          dropPreAuth();
        },
      };
      void handleStart(ws, parsed.data, ctl)
        .catch((e) => {
          if (e instanceof SetupExpired) return; // the deadline timer already closed the socket
          log.error("session setup failed", safeErr(e));
          if (!closed && !expired) rejectWith(ws, 1011, "internal", "internal error");
        })
        .finally(ctl.done);
    });
  });

  async function handleStart(
    ws: WebSocket,
    start: { token: string; clinicId: string; language?: LanguageCode | undefined },
    ctl: {
      gone: () => boolean;
      bound: <T>(p: Promise<T>) => Promise<T>;
      early: Array<{ data: RawData; isBinary: boolean }>;
      hold: (d: RawData, b: boolean) => void;
      done: () => void;
    },
  ): Promise<void> {
    const reqClinic = logId(start.clinicId);
    // --- authenticate
    let identity;
    try {
      identity = await ctl.bound(verifier.verify(start.token));
    } catch (e) {
      if (ctl.gone()) return;
      if (e instanceof AuthUnavailableError) {
        const cause = (e as { cause?: unknown }).cause;
        log.warn("auth unavailable", { clinicId: reqClinic, ...(cause ? safeErr(cause) : {}) });
        rejectWith(ws, 1011, "provider", "authentication service unavailable");
      } else {
        log.info("auth failed", { clinicId: reqClinic });
        rejectWith(ws, 4001, "auth_failed", "invalid or expired token");
      }
      return;
    }
    if (ctl.gone()) return;
    // --- authorize (lookup only: a valid identity must not create user rows here)
    const user = await ctl.bound(getUserByCognitoSub(db, identity.sub));
    if (ctl.gone()) return;
    const membership = user
      ? await ctl.bound(getMembership(db, { userId: user.id, clinicId: start.clinicId }))
      : null;
    if (ctl.gone()) return;
    if (!user || !membership) {
      log.info("forbidden", { sub: identity.sub, clinicId: reqClinic });
      rejectWith(ws, 4003, "forbidden", "not a member of this clinic");
      return;
    }
    const clinic = await ctl.bound(getClinicContext(db, start.clinicId));
    if (ctl.gone()) return;
    const clinicId = clinic.clinic.id;
    const enabled = clinic.clinic.languages as string[];
    const language = (start.language ?? enabled[0] ?? "en-IN") as LanguageCode;
    if (!(LANGUAGE_CODES as readonly string[]).includes(language) || !enabled.includes(language)) {
      rejectWith(ws, 4003, "forbidden", "language not enabled for this clinic");
      return;
    }

    // --- usage cap
    // Phase 1 limits (parked): the ledger is written only when a call ends, so up to
    // maxConcurrentCalls simultaneous calls can each use the full remaining minutes (overshoot),
    // and the concurrency counters below are per process (per-clinic limit x instance count).
    const plan = await ctl.bound(getPlanForClinic(db, clinicId));
    const month = usageMonth(clinic.clinic.timezone, now());
    const used = await ctl.bound(getUsedCallSeconds(db, clinicId, month));
    if (ctl.gone()) return;
    const secondsRemaining = plan.includedCallMinutes * 60 - used;
    if (secondsRemaining <= 0) {
      log.info("quota exhausted", { sub: identity.sub, clinicId });
      rejectWith(ws, 4029, "quota", "monthly call minutes exhausted");
      return;
    }

    // --- concurrency (check + reserve with no await in between)
    if (active >= env.maxSessions || (perClinic.get(clinicId) ?? 0) >= plan.maxConcurrentCalls) {
      log.info("busy", { sub: identity.sub, clinicId });
      rejectWith(ws, 4029, "busy", "too many concurrent calls");
      return;
    }
    active++;
    perClinic.set(clinicId, (perClinic.get(clinicId) ?? 0) + 1);
    let released = false;
    const releaseOnce = () => {
      if (released) return;
      released = true;
      release(clinicId);
    };

    let call;
    const callP = createCall(db, { clinicId, channel: "browser", startedByUserId: user.id });
    try {
      call = await ctl.bound(callP);
    } catch (e) {
      releaseOnce();
      // If the insert eventually lands after the deadline, close the orphan row out.
      void callP
        .then((row) =>
          finishCall(db, {
            callId: row.id,
            clinicId,
            status: "failed",
            outcome: "abandoned",
            durationS: 0,
          }),
        )
        .catch(() => undefined);
      throw e;
    }
    const callId = call.id;
    const sessLog: SessionLogger = {
      info: (m, f) => log.info(m, { callId, clinicId, sub: identity.sub, ...f }),
      warn: (m, f) => log.warn(m, { callId, clinicId, sub: identity.sub, ...f }),
      error: (m, f) => log.error(m, { callId, clinicId, sub: identity.sub, ...f }),
    };

    if (ctl.gone()) {
      // Caller left (or setup expired / shutdown began) before the session started:
      // close the row out as abandoned. No usage is recorded.
      try {
        await finishCall(db, {
          callId,
          clinicId,
          status: "failed",
          outcome: "abandoned",
          durationS: 0,
        });
      } catch {
        /* best effort */
      }
      releaseOnce();
      rejectWith(ws, 1011, "internal", "session setup aborted");
      return;
    }

    const transport = new WsTransport(ws);
    ws.off("message", ctl.hold);
    for (const f of ctl.early) transport.feed(f.data, f.isBinary);

    const { disclosure, greeting } = openingUtterances(clinic.assistant, clinic.clinic, language);
    const session = new VoiceSession({
      transport,
      stt: providers.stt,
      tts: providers.tts,
      llm: providers.llm,
      db,
      log: sessLog,
      ctx: {
        clinic,
        callId,
        language,
        now,
        maxDurationS: env.maxCallSeconds,
        secondsRemaining,
        channel: "browser",
        callerPhone: undefined,
        verifiedPhone: undefined,
      },
    });

    // Settle the call exactly once: usage ledger + slot release. Triggered when the session
    // closes the transport, or by the backstop below if the socket dropped and it never does.
    let settledOnce = false;
    let resolveSettled!: () => void;
    const settled = new Promise<void>((r) => (resolveSettled = r));
    const entry: LiveCall = { session, settled };
    live.add(entry);
    const settle = (finishRow: boolean) => {
      if (settledOnce) return;
      settledOnce = true;
      const durationS = session.durationS;
      void (async () => {
        try {
          if (finishRow) {
            await finishCall(db, {
              callId,
              clinicId,
              status: "failed",
              outcome: "abandoned",
              durationS,
            });
          }
          await recordCallUsage(db, {
            clinicId,
            month: usageMonth(clinic.clinic.timezone, now()),
            callSeconds: durationS,
          });
        } catch (e) {
          sessLog.error("call settle failed", safeErr(e));
        } finally {
          releaseOnce();
          live.delete(entry);
          resolveSettled();
          sessLog.info("call settled", { durationS });
        }
      })();
    };
    transport.onceClosed(() => settle(false));
    // Backstop: if the socket closes and the session still has not closed out after a grace
    // period (e.g. a hung DB write), settle anyway so the slot is never leaked.
    const onSocketClose = () => {
      const t = setTimeout(() => settle(true), closeGraceMs);
      void settled.then(() => clearTimeout(t));
    };
    if (ws.readyState === ws.OPEN) ws.once("close", onSocketClose);
    else onSocketClose();

    transport.sendEvent({
      type: "ready",
      callId,
      assistantName: clinic.assistant?.name ?? "the receptionist",
      greeting: `${disclosure} ${greeting}`,
      language,
    });
    sessLog.info("session accepted", { language });
    ctl.done();
    try {
      await session.start();
    } catch (e) {
      sessLog.error("session start failed", safeErr(e));
      await session.end("error");
    }
  }

  server.shutdown = async () => {
    shuttingDown = true;
    log.info("shutdown started", { live: live.size });
    // Stop accepting connections; existing sockets are handled below.
    server.close();
    const pending = [...live];
    for (const c of pending) void c.session.end("error");
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.allSettled(pending.map((c) => c.settled)),
      new Promise<void>((r) => {
        timer = setTimeout(r, shutdownGraceMs);
      }),
    ]);
    clearTimeout(timer);
    for (const c of wss.clients) c.terminate();
    server.closeAllConnections();
    wss.close();
  };
  return server;
}
