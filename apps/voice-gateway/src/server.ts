import http from "node:http";
import {
  AuthUnavailableError,
  CoreError,
  createCall,
  finishCall,
  getClinicContext,
  getMembership,
  getPlanForClinic,
  getUsedCallSeconds,
  recordCallUsage,
  upsertUser,
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
import { WebSocketServer, type WebSocket } from "ws";
import { createVerifier } from "./auth.js";
import type { VoiceEnv } from "./env.js";
import { BedrockLlm } from "./providers/bedrock-llm.js";
import { FakeLlm, FakeStt, FakeTts } from "./providers/fakes.js";
import { SarvamStt } from "./providers/sarvam-stt.js";
import { SarvamTts } from "./providers/sarvam-tts.js";
import type { LlmProvider, SttProvider, TtsProvider } from "./providers/types.js";
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
  heartbeatMs?: number;
}

const START_TIMEOUT_MS = 5000;
const HEARTBEAT_MS = 20_000;
const MAX_MISSED_PONGS = 2;
const MAX_PAYLOAD = 64 * 1024;

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
  try {
    ws.send(JSON.stringify({ type: "error", code: event, message } satisfies GatewayEvent));
    ws.close(code, event);
  } catch {
    ws.terminate();
  }
}

export function createServer(deps: ServerDeps): http.Server {
  const { db, env } = deps;
  const log = deps.log ?? consoleLogger;
  const now = deps.now ?? (() => new Date());
  const verifier = deps.verifier ?? createVerifier(env);
  const providers = deps.providers ?? createProviders(env);
  const startTimeoutMs = deps.startTimeoutMs ?? START_TIMEOUT_MS;
  const heartbeatMs = deps.heartbeatMs ?? HEARTBEAT_MS;

  let active = 0;
  const perClinic = new Map<string, number>();
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
  });

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
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  wss.on("connection", (ws) => {
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
    ws.on("close", () => clearInterval(hb));
    ws.on("error", () => ws.terminate());

    let closed = false;
    ws.on("close", () => {
      closed = true;
    });

    // First frame must be a valid `start` within the deadline.
    const timer = setTimeout(() => {
      ws.removeAllListeners("message");
      rejectWith(ws, 4001, "auth_failed", "start frame not received in time");
    }, startTimeoutMs);
    ws.once("message", (data, isBinary) => {
      clearTimeout(timer);
      let parsed: ReturnType<typeof clientEventSchema.safeParse> | undefined;
      if (!isBinary) {
        try {
          parsed = clientEventSchema.safeParse(JSON.parse(data.toString()));
        } catch {
          parsed = undefined;
        }
      }
      if (!parsed?.success || parsed.data.type !== "start") {
        rejectWith(ws, 4001, "auth_failed", "first frame must be a start message");
        return;
      }
      const start = parsed.data;
      void handleStart(ws, start, () => closed).catch((e) => {
        log.error("session setup failed", safeErr(e));
        rejectWith(ws, 1011, "internal", "internal error");
      });
    });
  });

  async function handleStart(
    ws: WebSocket,
    start: { token: string; clinicId: string; language?: LanguageCode | undefined },
    isClosed: () => boolean,
  ): Promise<void> {
    // --- authenticate
    let identity;
    try {
      identity = await verifier.verify(start.token);
    } catch (e) {
      if (e instanceof AuthUnavailableError) {
        log.warn("auth unavailable", { clinicId: start.clinicId });
        rejectWith(ws, 1011, "provider", "authentication service unavailable");
      } else {
        log.info("auth failed", { clinicId: start.clinicId });
        rejectWith(ws, 4001, "auth_failed", "invalid or expired token");
      }
      return;
    }
    let user;
    try {
      user = await upsertUser(db, { cognitoSub: identity.sub, email: identity.email });
    } catch (e) {
      if (e instanceof CoreError && e.code === "conflict")
        rejectWith(ws, 4003, "forbidden", "account conflict");
      else if (e instanceof CoreError) rejectWith(ws, 4001, "auth_failed", "invalid account");
      else throw e;
      return;
    }
    // --- authorize
    const membership = await getMembership(db, { userId: user.id, clinicId: start.clinicId });
    if (!membership) {
      log.info("forbidden", { sub: identity.sub, clinicId: start.clinicId });
      rejectWith(ws, 4003, "forbidden", "not a member of this clinic");
      return;
    }
    const clinic = await getClinicContext(db, start.clinicId);
    const clinicId = clinic.clinic.id;
    const enabled = clinic.clinic.languages as string[];
    const language = (start.language ?? enabled[0] ?? "en-IN") as LanguageCode;
    if (!(LANGUAGE_CODES as readonly string[]).includes(language) || !enabled.includes(language)) {
      rejectWith(ws, 4003, "forbidden", "language not enabled for this clinic");
      return;
    }

    // --- usage cap
    const plan = await getPlanForClinic(db, clinicId);
    const month = usageMonth(clinic.clinic.timezone, now());
    const used = await getUsedCallSeconds(db, clinicId, month);
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
    try {
      call = await createCall(db, {
        clinicId,
        channel: "browser",
        startedByUserId: user.id,
      });
    } catch (e) {
      releaseOnce();
      throw e;
    }
    const callId = call.id;
    const sessLog: SessionLogger = {
      info: (m, f) => log.info(m, { callId, clinicId, sub: identity.sub, ...f }),
      warn: (m, f) => log.warn(m, { callId, clinicId, sub: identity.sub, ...f }),
      error: (m, f) => log.error(m, { callId, clinicId, sub: identity.sub, ...f }),
    };

    if (isClosed()) {
      // Caller left during setup: close out the row without starting a session.
      try {
        await finishCall(db, { callId, clinicId, status: "completed", durationS: 0 });
      } catch {
        /* best effort */
      }
      releaseOnce();
      return;
    }

    const transport = new WsTransport(ws);
    const startedAt = now().getTime();
    transport.onceClosed(() => {
      const durationS = Math.max(0, Math.round((now().getTime() - startedAt) / 1000));
      void recordCallUsage(db, {
        clinicId,
        month: usageMonth(clinic.clinic.timezone, now()),
        callSeconds: durationS,
      })
        .catch((e) => sessLog.error("usage ledger update failed", safeErr(e)))
        .finally(releaseOnce);
      sessLog.info("call closed", { durationS });
    });

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

    const a = clinic.assistant;
    const assistantName = a?.name ?? "the receptionist";
    const greeting =
      a?.greeting?.[language] ??
      Object.values(a?.greeting ?? {}).find((g) => g.trim()) ??
      `Hello, this is ${assistantName} at ${clinic.clinic.name}. How can I help you?`;
    transport.sendEvent({ type: "ready", callId, assistantName, greeting, language });
    sessLog.info("session accepted", { language });
    try {
      await session.start();
    } catch (e) {
      sessLog.error("session start failed", safeErr(e));
      await session.end("error");
    }
  }

  server.on("close", () => {
    for (const c of wss.clients) c.terminate();
    wss.close();
  });
  return server;
}
