import http from "node:http";
import {
  AuthUnavailableError,
  verifyStreamToken,
  createCall,
  finishCall,
  getClinicContext,
  getMembership,
  getUserByCognitoSub,
  getPlanForClinic,
  getUsedCallSeconds,
  recordCallUsage,
  setCallRecording,
  usageMonth,
  type TokenVerifier,
} from "@muxaris/core";
import type { Db } from "@muxaris/db";
import {
  clientEventSchema,
  clinicRecordCalls,
  LANGUAGE_CODES,
  postCallMessageSchema,
  type GatewayEvent,
  type LanguageCode,
  type PostCallMessage,
} from "@muxaris/shared";
import { createS3BlobStore, createSqsQueue, type BlobStore, type JobQueue } from "@muxaris/storage";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { createVerifier } from "./auth.js";
import type { VoiceEnv } from "./env.js";
import { BedrockLlm } from "./providers/bedrock-llm.js";
import { FakeLlm, FakeStt, FakeTts } from "./providers/fakes.js";
import { SarvamStt } from "./providers/sarvam-stt.js";
import { SarvamTts } from "./providers/sarvam-tts.js";
import type { LlmProvider, SttProvider, TtsProvider } from "./providers/types.js";
import { completeCall } from "./post-call.js";
import { openingUtterances } from "./session/prompt.js";
import { VoiceSession, type SessionLogger } from "./session/voice-session.js";
import { TwilioMediaStreamTransport } from "./telephony/twilio-transport.js";
import { WsTransport } from "./ws-transport.js";

export interface Providers {
  stt: SttProvider;
  tts: TtsProvider;
  llm: LlmProvider;
}

/** Resolved storage clients; both null when storage is disabled. */
export interface Storage {
  blobs: BlobStore | null;
  queue: JobQueue<PostCallMessage> | null;
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
> &
  Partial<
    Pick<
      VoiceEnv,
      "callsBucket" | "postCallQueueUrl" | "storageDisabled" | "channels" | "telephony"
    >
  >;

export interface ServerDeps {
  version: string;
  db: Db;
  env: ServerEnv;
  providers?: Providers;
  /** Recording storage; defaults to clients built from env (none when storage is disabled). */
  storage?: Storage;
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
  /** Where recorder spool files go (default: private per-process temp dir). */
  spoolDir?: string;
  heartbeatMs?: number;
}

const PHONE_PATH = "/v1/telephony/twilio";
const START_TIMEOUT_MS = 5000;
const SETUP_TIMEOUT_MS = 10_000;
/**
 * How long a SIGTERM waits for live calls to settle and their recording uploads to finish.
 * The gateway container's ECS stopTimeout is 90 s (infra/lib/services-stack.ts), after which ECS
 * sends SIGKILL, so this must stay under it: 80 s here, plus a 3 s abort wait, the pool close and
 * the hard-exit margin in index.ts. The wait is a race against the drain, so an idle gateway
 * still shuts down in seconds.
 */
export const SHUTDOWN_GRACE_MS = 80_000;
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

export function createStorage(env: ServerEnv): Storage {
  if (env.storageDisabled || !env.callsBucket) return { blobs: null, queue: null };
  return {
    blobs: createS3BlobStore({ bucket: env.callsBucket, region: env.awsRegion }),
    queue: env.postCallQueueUrl
      ? createSqsQueue<PostCallMessage>({
          url: env.postCallQueueUrl,
          region: env.awsRegion,
          parse: (raw) => postCallMessageSchema.parse(raw),
        })
      : null,
  };
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
  const storage = deps.storage ?? createStorage(env);
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
  /** Post-call uploads still running; shutdown() waits for them. */
  const inFlightCompletions = new Set<Promise<void>>();
  const completionAbort = new AbortController();
  const release = (clinicId: string) => {
    active = Math.max(0, active - 1);
    const n = (perClinic.get(clinicId) ?? 1) - 1;
    if (n <= 0) perClinic.delete(clinicId);
    else perClinic.set(clinicId, n);
  };

  const server = http.createServer((req, res) => {
    if (req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          service: "voice-gateway",
          version: deps.version,
          provider: env.provider,
        }),
      );
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
    const phone = path === PHONE_PATH && env.telephony?.provider === "twilio";
    if (path !== "/v1/session" && !phone) {
      socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    // Twilio sends no Origin header; phone sessions are authenticated by the stream token.
    const origin = req.headers.origin;
    if (!phone && origin && !env.corsOrigins.includes(origin)) {
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

  wss.on("connection", (ws, req) => {
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

    if ((req.url ?? "").split("?")[0] === PHONE_PATH) {
      const ctl: SetupCtl = {
        gone: () => closed || expired || shuttingDown,
        bound: <T>(p: Promise<T>): Promise<T> =>
          Promise.race([
            p,
            expiredP.then((): never => {
              throw new SetupExpired();
            }),
          ]),
        done: () => {
          clearTimers();
          dropPreAuth();
        },
      };
      const transport = new TwilioMediaStreamTransport(ws, { startTimeoutMs });
      const refuse = (code: number, reason: string) => {
        clearTimers();
        if (ws.readyState === ws.OPEN) ws.close(code, reason);
        else ws.terminate();
      };
      void (async () => {
        let started;
        try {
          started = await ctl.bound(transport.onceStarted());
        } catch (e) {
          if (e instanceof SetupExpired || ctl.gone()) return;
          refuse(4001, "auth_failed");
          return;
        }
        clearTimeout(startTimer);
        gotStart = true;
        const secret = env.telephony?.streamSecret;
        const claims = secret
          ? verifyStreamToken(secret, started.token, Math.floor(now().getTime() / 1000))
          : null;
        // The token is bound to this call: a token minted for another CallSid is not accepted.
        if (!claims || claims.callSid !== started.callSid) {
          log.info("phone auth failed");
          refuse(4001, "auth_failed");
          return;
        }
        if (ctl.gone()) return;
        const clinic = await ctl.bound(getClinicContext(db, claims.clinicId));
        if (ctl.gone()) return;
        const enabled = clinic.clinic.languages as string[];
        // Same rule as the browser path: only a known language code, else en-IN.
        const first = enabled[0];
        const language = (
          first && (LANGUAGE_CODES as readonly string[]).includes(first) ? first : "en-IN"
        ) as LanguageCode;
        await acceptSession(ws, ctl, {
          clinic,
          language,
          channel: "phone",
          // From the signed token, not the stream's own (unsigned) `from` parameter.
          callerPhone: claims.from || undefined,
          logFields: { callSid: started.callSid },
          makeTransport: () => transport,
        });
      })()
        .catch((e) => {
          if (e instanceof SetupExpired) return;
          log.error("phone session setup failed", safeErr(e));
          if (!closed && !expired) refuse(1011, "internal");
        })
        .finally(ctl.done);
      return;
    }

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
    const enabled = clinic.clinic.languages as string[];
    const language = (start.language ?? enabled[0] ?? "en-IN") as LanguageCode;
    if (!(LANGUAGE_CODES as readonly string[]).includes(language) || !enabled.includes(language)) {
      rejectWith(ws, 4003, "forbidden", "language not enabled for this clinic");
      return;
    }
    return acceptSession(ws, ctl, {
      clinic,
      language,
      channel: "browser",
      startedByUserId: user.id,
      logFields: { sub: identity.sub },
      makeTransport: () => {
        const transport = new WsTransport(ws);
        ws.off("message", ctl.hold);
        for (const f of ctl.early) transport.feed(f.data, f.isBinary);
        return transport;
      },
    });
  }

  type SetupCtl = {
    gone: () => boolean;
    bound: <T>(p: Promise<T>) => Promise<T>;
    done: () => void;
  };

  /**
   * Shared by browser and phone sessions: plan quota, concurrency, call row, VoiceSession.
   * Callers have already authenticated the caller and loaded the clinic context.
   */
  async function acceptSession(
    ws: WebSocket,
    ctl: SetupCtl,
    a: {
      clinic: Awaited<ReturnType<typeof getClinicContext>>;
      language: LanguageCode;
      channel: "browser" | "phone";
      callerPhone?: string | undefined;
      startedByUserId?: string | undefined;
      /** Extra fields for every log line of this call (e.g. the user sub; never a phone number). */
      logFields: Record<string, unknown>;
      makeTransport: () => WsTransport | TwilioMediaStreamTransport;
    },
  ): Promise<void> {
    const { clinic, language } = a;
    const clinicId = clinic.clinic.id;
    // --- usage cap
    // Phase 1 limits (parked): the ledger is written only when a call ends, so up to
    // maxConcurrentCalls simultaneous calls can each use the full remaining minutes (overshoot),
    // and the concurrency counters below are per process (per-clinic limit x instance count).
    const plan = await ctl.bound(getPlanForClinic(db, clinicId));
    const month = usageMonth(clinic.clinic.timezone, now());
    const used = await ctl.bound(getUsedCallSeconds(db, clinicId, month));
    if (ctl.gone()) return;
    const planSecondsRemaining = plan.includedCallMinutes * 60 - used;
    if (planSecondsRemaining <= 0) {
      log.info("quota exhausted", { ...a.logFields, clinicId });
      rejectWith(ws, 4029, "quota", "monthly call minutes exhausted");
      return;
    }

    // Pricing promise: a call that starts is never cut off by the plan; overage lands in the
    // ledger and is billed per minute. Only the per-call cap limits an in-flight call.
    const callSecondsAllowed = env.maxCallSeconds;

    // --- concurrency (check + reserve with no await in between)
    if (active >= env.maxSessions || (perClinic.get(clinicId) ?? 0) >= plan.maxConcurrentCalls) {
      log.info("busy", { ...a.logFields, clinicId });
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
    const startedAt = now();
    const callP = createCall(db, {
      clinicId,
      channel: a.channel,
      ...(a.startedByUserId ? { startedByUserId: a.startedByUserId } : {}),
      ...(a.callerPhone ? { callerPhone: a.callerPhone } : {}),
    });
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
      info: (m, f) => log.info(m, { callId, clinicId, ...a.logFields, ...f }),
      warn: (m, f) => log.warn(m, { callId, clinicId, ...a.logFields, ...f }),
      error: (m, f) => log.error(m, { callId, clinicId, ...a.logFields, ...f }),
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

    // From here a throw (transport, session construction, ...) must not leak the slot or leave
    // the call row in progress.
    let settleRef: ((finishRow: boolean) => void) | undefined;
    try {
      const transport = a.makeTransport();

      const wantRecording = clinicRecordCalls(clinic.clinic.settings) && storage.blobs !== null;
      const session = new VoiceSession({
        transport,
        stt: providers.stt,
        tts: providers.tts,
        llm: providers.llm,
        db,
        log: sessLog,
        ...(deps.spoolDir ? { spoolDir: deps.spoolDir } : {}),
        ctx: {
          clinic,
          callId,
          language,
          now,
          maxDurationS: callSecondsAllowed,
          secondsRemaining: callSecondsAllowed,
          recordCalls: wantRecording,
          channel: a.channel,
          callerPhone: a.callerPhone,
          verifiedPhone: undefined,
          channels: env.channels ?? { sms: false, whatsapp: false },
        },
      });

      // The session decides whether recording really is on (the recorder may be unavailable).
      const recordCalls = session.recorder !== null;
      if (recordCalls) {
        await ctl
          .bound(setCallRecording(db, { clinicId, callId, status: "pending" }))
          .catch((e) => {
            if (e instanceof SetupExpired) throw e;
            sessLog.warn("recording status pending failed", safeErr(e));
          });
      }
      const { disclosure, greeting } = openingUtterances(
        clinic.assistant,
        clinic.clinic,
        language,
        { recorded: recordCalls },
      );

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
            // The row may still be in_progress if the session's own finishCall failed (or the
            // session never closed out): finish it again (idempotent) with the real outcome.
            if (finishRow || !session.finished) {
              const f = finishRow ? null : session.finishOutcome;
              try {
                await finishCall(db, {
                  callId,
                  clinicId,
                  status: f?.status ?? "failed",
                  outcome: f?.outcome ?? "abandoned",
                  durationS: f?.durationS ?? durationS,
                });
              } catch {
                // Still bill below; the once-guard keeps the later sweep from billing again.
                sessLog.error("call finish retry failed", { callId });
              }
            }
            await recordCallUsage(db, {
              callId,
              clinicId,
              month: usageMonth(clinic.clinic.timezone, startedAt),
              callSeconds: durationS,
              llmInputTokens: session.llmUsage.inputTokens,
              llmOutputTokens: session.llmUsage.outputTokens,
            });
          } catch (e) {
            sessLog.error("call settle failed", safeErr(e));
          } finally {
            // Upload + enqueue in the background; never blocks the slot or the socket close.
            const completion: Promise<void> = completeCall(
              { db, blobs: storage.blobs, queue: storage.queue, log: sessLog },
              {
                clinicId,
                callId,
                recorder: session.recorder,
                endedAt: now(),
                userTurns: session.userTurns,
                signal: completionAbort.signal,
              },
            ).finally(() => inFlightCompletions.delete(completion));
            inFlightCompletions.add(completion);
            releaseOnce();
            live.delete(entry);
            resolveSettled();
            sessLog.info("call settled", { durationS });
          }
        })();
      };
      settleRef = settle;
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
        secondsRemaining: callSecondsAllowed,
        // Informational: the plan is nearly used up (calls are not cut off by it).
        ...(planSecondsRemaining < env.maxCallSeconds ? { planSecondsRemaining } : {}),
      });
      sessLog.info("session accepted", { language });
      ctl.done();
      try {
        await session.start();
      } catch (e) {
        sessLog.error("session start failed", safeErr(e));
        await session.end("error");
      }
    } catch (e) {
      sessLog.error("session setup failed", safeErr(e));
      if (settleRef) settleRef(true);
      else {
        releaseOnce();
        await finishCall(db, {
          callId,
          clinicId,
          status: "failed",
          outcome: "abandoned",
          durationS: 0,
        }).catch(() => undefined);
      }
      rejectWith(ws, 1011, "internal", "session setup failed");
    }
  }

  server.shutdown = async () => {
    shuttingDown = true;
    log.info("shutdown started", { live: live.size });
    // Stop accepting connections; existing sockets are handled below.
    server.close();
    const pending = [...live];
    for (const c of pending) void c.session.end("server_shutdown");
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Live calls settle first (which starts their uploads), then uploads are awaited.
    const drained = Promise.allSettled(pending.map((c) => c.settled)).then(() =>
      Promise.allSettled([...inFlightCompletions]),
    );
    const timedOut = await Promise.race([
      drained.then(() => false),
      new Promise<boolean>((r) => {
        timer = setTimeout(() => r(true), shutdownGraceMs);
      }),
    ]);
    clearTimeout(timer);
    if (timedOut && inFlightCompletions.size > 0) {
      // Grace is over: mark unfinished recordings failed rather than losing track of them.
      log.warn("aborting in-flight completions", { count: inFlightCompletions.size });
      completionAbort.abort();
      let t2: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        Promise.allSettled([...inFlightCompletions]),
        new Promise<void>((r) => {
          t2 = setTimeout(r, 3000);
        }),
      ]);
      clearTimeout(t2);
    }
    for (const c of wss.clients) c.terminate();
    server.closeAllConnections();
    wss.close();
  };
  return server;
}
