import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendTurn, finishCall } from "@muxaris/core";
import type { Db } from "@muxaris/db";
import {
  ASSISTANT_TOOLS,
  indianPhone,
  LANGUAGES,
  LANGUAGE_CODES,
  type ChannelFlags,
  type ClientEvent,
  type GatewayEvent,
  type LanguageCode,
  type ToolName,
} from "@muxaris/shared";
import { toBedrockTools } from "../providers/bedrock-llm.js";
import type {
  ConverseMessage,
  LlmProvider,
  SttProvider,
  SttStream,
  TtsProvider,
  TtsUtterance,
} from "../providers/types.js";
import { Recorder } from "./recorder.js";
import { buildSystemPrompt, openingUtterances, type ClinicContext } from "./prompt.js";
import { chunkSentences } from "./sentence-chunker.js";
import { executeTool, summarizeResult, type ToolContext } from "./tools.js";
import type { MediaTransport } from "./transport.js";

export type { MediaTransport } from "./transport.js";

export interface SessionContext {
  clinic: ClinicContext;
  callId: string;
  language: LanguageCode;
  now: () => Date;
  /** Hard cap for one call, seconds (600). */
  maxDurationS: number;
  /** Seconds left in the clinic's plan; the call ends with reason "cap" when it reaches zero. */
  secondsRemaining: number;
  /** Record both audio channels (and speak the recorded disclosure variant). */
  recordCalls: boolean;
  /**
   * "browser" (default) callers are authenticated clinic members whose phone is self-asserted.
   * Task 7 always passes `callerPhone` for "phone" calls; a phone call without one falls back to
   * claim-based binding, while a caller ID that is present but invalid fails closed.
   */
  channel?: "browser" | "phone";
  /** Phone verified by OTP (Phase 3 hook). Highest precedence when binding patient data. */
  verifiedPhone?: string | undefined;
  /** Telephony caller ID on phone calls; undefined for browser calls (self-asserted identity). */
  callerPhone?: string | undefined;
  /** Number first claimed by the caller in this call (managed by executeTool). */
  claimedPhone?: string | undefined;
  /** Platform channel flags for outbox rows written by booking tools. */
  channels: ChannelFlags;
}

export type EndReason = Extract<GatewayEvent, { type: "ended" }>["reason"];

/** Structured logger. Never pass transcript text, tool input or patient data. */
export interface SessionLogger {
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

export interface SessionTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(h: unknown): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(h: unknown): void;
}

export const defaultTimers: SessionTimers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (h) => globalThis.clearInterval(h as ReturnType<typeof setInterval>),
};

export interface VoiceSessionDeps {
  transport: MediaTransport;
  stt: SttProvider;
  tts: TtsProvider;
  llm: LlmProvider;
  db: Db;
  ctx: SessionContext;
  log: SessionLogger;
  timers?: SessionTimers;
  /** Test seam: where recorder spool files go (default: a private per-process temp dir). */
  spoolDir?: string;
}

type CallOutcome =
  "booked" | "rescheduled" | "cancelled" | "info" | "callback" | "handoff" | "abandoned";

const MAX_MESSAGES = 30;
const MAX_TOOL_ROUNDS = 6;
/** Tool calls executed per LLM round; extras are answered with a "too_many_tools" error. */
const MAX_TOOLS_PER_ROUND = 3;
/** One reconnect attempt after a mid-call STT drop must finish within this window. */
const STT_RECONNECT_MS = 2000;
const MAX_STT_RECONNECTS = 3;
const USAGE_INTERVAL_MS = 30_000;
const TOOLS = toBedrockTools(ASSISTANT_TOOLS);
/** PCM16 mono 24 kHz */
const BYTES_PER_MS = 48;
/** A barge-in this soon after the last audio is sent still hits audio the client is playing. */
const LATE_BARGE_IN_MS = 3000;

const FALLBACK: Record<LanguageCode, string> = {
  "en-IN": "I'm having trouble with that, let me connect you to our staff.",
  "hi-IN": "मुझे इसमें दिक्कत आ रही है, मैं आपको हमारे स्टाफ से जोड़ती हूँ।",
  "kn-IN": "ಇದರಲ್ಲಿ ತೊಂದರೆಯಾಗುತ್ತಿದೆ, ನಾನು ನಿಮ್ಮನ್ನು ನಮ್ಮ ಸಿಬ್ಬಂದಿಗೆ ಸಂಪರ್ಕಿಸುತ್ತೇನೆ.",
  "ta-IN": "இதில் சிக்கல் உள்ளது, உங்களை எங்கள் ஊழியர்களுடன் இணைக்கிறேன்.",
  "te-IN": "దీనిలో సమస్య ఉంది, మిమ్మల్ని మా సిబ్బందికి కలుపుతాను.",
};

const isLanguageCode = (s: string | undefined): s is LanguageCode =>
  s !== undefined && (LANGUAGE_CODES as readonly string[]).includes(s);

/** Spoken when speech recognition fails for good; the call then ends. */
const STT_TROUBLE: Record<LanguageCode, string> = {
  "en-IN": "I'm having trouble hearing you, please call the clinic directly.",
  "hi-IN": "मुझे आपकी आवाज़ सुनने में दिक्कत आ रही है, कृपया क्लिनिक को सीधे कॉल करें।",
  "kn-IN": "ನಿಮ್ಮ ಮಾತು ಕೇಳಲು ತೊಂದರೆಯಾಗುತ್ತಿದೆ, ದಯವಿಟ್ಟು ಕ್ಲಿನಿಕ್‌ಗೆ ನೇರವಾಗಿ ಕರೆ ಮಾಡಿ.",
  "ta-IN": "உங்கள் குரலைக் கேட்பதில் சிக்கல் உள்ளது, தயவுசெய்து கிளினிக்கை நேரடியாக அழைக்கவும்.",
  "te-IN": "మీ మాట వినడంలో సమస్య ఉంది, దయచేసి క్లినిక్‌కు నేరుగా కాల్ చేయండి.",
};

type UsedOutcome = "booked" | "rescheduled" | "cancelled" | "callback" | "handoff";
const TOOL_OUTCOME: Partial<Record<ToolName, UsedOutcome>> = {
  book_appointment: "booked",
  reschedule_appointment: "rescheduled",
  cancel_appointment: "cancelled",
  request_callback: "callback",
  transfer_to_staff: "handoff",
};

/** Minimal push-based async iterable used to feed LLM text into the sentence chunker. */
class TextQueue implements AsyncIterable<string> {
  private items: string[] = [];
  private done = false;
  private wake: (() => void) | null = null;
  push(s: string): void {
    this.items.push(s);
    this.wake?.();
  }
  close(): void {
    this.done = true;
    this.wake?.();
  }
  async *[Symbol.asyncIterator](): AsyncGenerator<string> {
    for (;;) {
      const next = this.items.shift();
      if (next !== undefined) {
        yield next;
        continue;
      }
      if (this.done) return;
      await new Promise<void>((r) => {
        this.wake = r;
      });
      this.wake = null;
    }
  }
}

/** Shared per-round speech bookkeeping: sentences started, and when the round's audio began. */
interface SpokenRound {
  /** Sentences whose audio actually started. */
  started: number;
  /** When the round's first sentence was queued (fallback turn start). */
  enqueuedAt?: number;
  /** When the round's first audio chunk was handed to the transport. */
  firstAudioAt?: number;
}

interface SpeechItem {
  text: string;
  disclosure?: boolean;
  epoch: number;
  spoken?: SpokenRound | undefined;
}

interface TurnInfo {
  epoch: number;
  speechEndAt: number;
  /** Speech end to transcript, ms; null when the STT sent no speech_end signal. */
  sttMs: number | null;
  llmStartAt?: number;
  llmFirstTokenAt?: number;
  firstSentenceAt?: number;
  firstAudioAt?: number;
}

let processSpoolDir: string | undefined;
/** One private (0700) spool directory per process, created on first use. */
function spoolDir(): string {
  processSpoolDir ??= mkdtempSync(join(tmpdir(), "muxaris-rec-"));
  return processSpoolDir;
}

export class VoiceSession {
  private readonly transport: MediaTransport;
  private readonly sttProvider: SttProvider;
  private readonly tts: TtsProvider;
  private readonly llm: LlmProvider;
  private readonly db: Db;
  private readonly ctx: SessionContext;
  private readonly log: SessionLogger;
  private readonly timers: SessionTimers;

  /** Stereo recorder (null when recording is off); closed out by the server after finishCall. */
  readonly recorder: Recorder | null;

  private stt: SttStream | null = null;
  private language: LanguageCode;
  private detectedLanguage: LanguageCode | undefined;
  private state: "listening" | "thinking" | "speaking" | null = null;
  private started = false;
  private ended = false;
  private disclosurePending = false;
  private finalDurationS: number | undefined;
  private startedAt = 0;

  /** Bumped on every barge-in: anything tagged with an older epoch is stale and dropped. */
  private epoch = 0;
  private turnAbort: AbortController | null = null;
  private turnChain: Promise<void> = Promise.resolve();
  private turn: TurnInfo | null = null;
  private speechEndAt: number | null = null;
  /** When the current utterance began (STT speech_start); stamps the persisted user turn. */
  private speechStartAt: number | null = null;
  /** Deferred row writes (spoken-turn start times) flushed at call end. */
  private readonly pendingRows = new Set<() => void>();
  private endRequested = false;
  /** End forced by a fallback (tool cap); unlike a normal end_call it survives barge-in. */
  private forcedEnd = false;
  private turnsPending = 0;
  private lastAudioSentAt = 0;
  private playbackEndsAt = 0;

  private speechQueue: SpeechItem[] = [];
  private pumpActive = false;
  private pumpPromise: Promise<void> | null = null;
  private currentUtt: TtsUtterance | null = null;

  private messages: ConverseMessage[] = [];
  private seq = 0;
  private persistChain: Promise<void> = Promise.resolve();
  /** User turns so far; read by the server to decide whether the call is worth recording. */
  userTurns = 0;
  private assistantTurns = 0;
  private toolCalls = 0;
  private latencies: number[] = [];
  private used = new Set<UsedOutcome>();
  private sttRecovering = false;
  private sttReconnects = 0;

  private readonly tctx: ToolContext;
  private readonly callerPhone: string | undefined;
  private readonly verifiedPhone: string | undefined;
  private maxTimer: unknown;
  private capTimer: unknown;
  private usageTimer: unknown;

  constructor(deps: VoiceSessionDeps) {
    this.transport = deps.transport;
    this.sttProvider = deps.stt;
    this.tts = deps.tts;
    this.llm = deps.llm;
    this.db = deps.db;
    this.ctx = deps.ctx;
    this.log = deps.log;
    this.timers = deps.timers ?? defaultTimers;
    this.language = deps.ctx.language;
    let recorder: Recorder | null = null;
    if (deps.ctx.recordCalls) {
      try {
        recorder = new Recorder({
          spoolDir: deps.spoolDir ?? spoolDir(),
          now: () => deps.ctx.now().getTime(),
          maxSamples: deps.ctx.maxDurationS * 16_000 + 16_000,
        });
      } catch (e) {
        // An unwritable temp dir must not kill the call: fall back to transcript-only.
        this.log.error("recorder unavailable", {
          err: (e as { name?: string })?.name ?? "unknown",
        });
      }
    }
    this.recorder = recorder;
    let unverifiable = false;
    const norm = (label: string, v: string | undefined) => {
      if (v === undefined) return undefined;
      const r = indianPhone.safeParse(v);
      if (!r.success) {
        // Fail closed: an unparseable caller ID must not downgrade to a self-asserted claim.
        unverifiable = true;
        this.log.warn("invalid phone in session context; identity unverifiable", { field: label });
      }
      return r.success ? r.data : undefined;
    };
    this.callerPhone = norm("callerPhone", deps.ctx.callerPhone);
    this.verifiedPhone = norm("verifiedPhone", deps.ctx.verifiedPhone);
    // Self-asserted claims are allowed only on the browser channel. Any other channel (or an
    // unset one) needs a valid verified/caller-ID number, else identity is unverifiable.
    if (deps.ctx.channel !== "browser" && !this.verifiedPhone && !this.callerPhone) {
      unverifiable = true;
    }
    this.tctx = {
      clinic: deps.ctx.clinic,
      callId: deps.ctx.callId,
      language: deps.ctx.language,
      now: deps.ctx.now,
      callerPhone: this.callerPhone,
      verifiedPhone: this.verifiedPhone,
      identityUnverifiable: unverifiable,
      claimedPhone: deps.ctx.claimedPhone,
      channels: deps.ctx.channels,
    };
  }

  // ------------------------------------------------------------------ lifecycle

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.startedAt = this.ctx.now().getTime();

    this.transport.onClose(() => void this.end("caller"));
    this.transport.onClientEvent((e: ClientEvent) => {
      if (e.type === "end") void this.end("caller");
    });

    this.maxTimer = this.timers.setTimeout(
      () => void this.end("timeout"),
      this.ctx.maxDurationS * 1000,
    );
    this.capTimer = this.timers.setTimeout(
      () => void this.end("cap"),
      Math.max(0, this.ctx.secondsRemaining) * 1000,
    );
    this.usageTimer = this.timers.setInterval(() => this.emitUsage(), USAGE_INTERVAL_MS);

    try {
      const stt = await this.sttProvider.open();
      if (this.ended) {
        stt.close();
        return;
      }
      this.stt = stt;
      this.attachStt(stt);
      this.transport.onInboundAudio((pcm) => {
        if (this.ended) return;
        this.recorder?.caller(pcm);
        this.stt?.sendAudio(pcm);
      });
    } catch {
      this.providerError("stt_open");
      return;
    }

    this.log.info("session started", { callId: this.ctx.callId, language: this.language });
    this.speakGreeting();
  }

  private attachStt(stt: SttStream): void {
    stt.on("speech_start", () => {
      this.speechStartAt ??= this.ctx.now().getTime();
      this.onSpeechStart();
    });
    stt.on("speech_end", () => {
      this.speechEndAt = this.ctx.now().getTime();
    });
    stt.on("transcript", (t) => this.onTranscript(t));
    stt.on("error", () => {
      if (this.stt === stt) void this.recoverStt(stt);
    });
  }

  /** Mid-call STT drop: one reconnect attempt within 2 s, else tell the caller and end. */
  private async recoverStt(dead: SttStream): Promise<void> {
    if (this.ended || this.sttRecovering) return;
    this.sttRecovering = true;
    this.stt = null; // inbound audio is dropped while reconnecting
    try {
      dead.close();
    } catch {
      /* already closed */
    }
    this.log.warn("stt dropped; reconnecting", { attempt: this.sttReconnects + 1 });
    let fresh: SttStream | null = null;
    if (this.sttReconnects < MAX_STT_RECONNECTS) {
      this.sttReconnects++;
      let timedOut = false;
      let timer: unknown;
      const open = this.sttProvider.open();
      try {
        fresh = await Promise.race([
          open,
          new Promise<never>((_, reject) => {
            timer = this.timers.setTimeout(() => {
              timedOut = true;
              reject(new Error("stt reconnect timed out"));
            }, STT_RECONNECT_MS);
          }),
        ]);
      } catch {
        fresh = null;
        // A socket that opens after the deadline must not leak.
        void open.then(
          (late) => {
            if (timedOut) late.close();
          },
          () => undefined,
        );
      }
      this.timers.clearTimeout(timer);
    }
    this.sttRecovering = false;
    if (this.ended) {
      fresh?.close();
      return;
    }
    if (fresh) {
      this.stt = fresh;
      this.attachStt(fresh);
      this.log.info("stt reconnected");
      return;
    }
    // Give up: say so in the caller's language, then end as a provider error. The call's
    // outcome (e.g. a booking already made) is untouched.
    this.interrupt();
    const line = STT_TROUBLE[this.language];
    this.assistantTurns++;
    const troubleSeq = this.seq++;
    const trouble: SpokenRound = { started: 0 };
    this.transport.sendEvent({ type: "transcript", role: "assistant", text: line, final: true });
    this.enqueueSpeech(line, this.epoch, trouble);
    await this.drain();
    this.persist({
      seq: troubleSeq,
      role: "assistant",
      text: line,
      startedAt: this.spokenAt(trouble),
    });
    this.providerError("stt");
  }

  /** Call duration in seconds: final once ended, running before that (0 if never started). */
  get durationS(): number {
    if (this.finalDurationS !== undefined) return this.finalDurationS;
    if (!this.startedAt) return 0;
    return Math.max(0, Math.round((this.ctx.now().getTime() - this.startedAt) / 1000));
  }

  async end(reason: EndReason): Promise<void> {
    return this.finish(reason, true);
  }

  private async finish(reason: EndReason, waitForTurn: boolean): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    this.timers.clearTimeout(this.maxTimer);
    this.timers.clearTimeout(this.capTimer);
    this.timers.clearInterval(this.usageTimer);
    this.epoch++;
    this.turnAbort?.abort();
    this.speechQueue.length = 0;
    this.currentUtt?.cancel();
    try {
      this.stt?.end();
    } catch {
      /* already closed */
    }
    try {
      this.stt?.close();
    } catch {
      /* already closed */
    }

    if (waitForTurn) {
      // Let an aborted in-flight turn flush its assistant rows before the call is closed out.
      let timer: unknown;
      await Promise.race([
        this.turnChain,
        new Promise<void>((r) => {
          timer = this.timers.setTimeout(r, 2000);
        }),
      ]);
      this.timers.clearTimeout(timer);
    }
    for (const flush of [...this.pendingRows]) flush();
    await this.persistChain;
    const outcome = this.outcome();
    const durationS = this.durationS;
    this.finalDurationS = durationS;
    try {
      await finishCall(this.db, {
        callId: this.ctx.callId,
        clinicId: this.ctx.clinic.clinic.id,
        status: reason === "error" ? "failed" : "completed",
        outcome,
        durationS,
        ...(this.detectedLanguage ? { languageDetected: this.detectedLanguage } : {}),
        metrics: this.metrics(),
        ...(this.tctx.patientId ? { patientId: this.tctx.patientId } : {}),
        ...(this.recorder ? { recorderStartedAt: new Date(this.recorder.startedAtMs) } : {}),
      });
    } catch (e) {
      this.log.error("finishCall failed", { code: errCode(e) });
    }
    this.transport.sendEvent({ type: "ended", reason, outcome });
    this.log.info("session ended", { reason, outcome, durationS });
    this.transport.close();
  }

  // ------------------------------------------------------------------ state + events

  private setState(s: "listening" | "thinking" | "speaking"): void {
    if (this.ended || this.state === s) return;
    this.log.info("state", { from: this.state, to: s });
    this.state = s;
    this.transport.sendEvent({ type: "state", state: s });
  }

  private emitUsage(): void {
    if (this.ended) return;
    const used = Math.max(0, Math.round((this.ctx.now().getTime() - this.startedAt) / 1000));
    this.transport.sendEvent({
      type: "usage",
      secondsUsed: used,
      secondsRemaining: Math.max(0, this.ctx.secondsRemaining - used),
    });
  }

  private providerError(where: string): void {
    if (this.ended) return;
    this.log.error("provider error", { where });
    this.transport.sendEvent({ type: "error", code: "provider", message: "Voice provider error" });
    void this.end("error");
  }

  private outcome(): CallOutcome {
    if (this.userTurns === 0) return "abandoned";
    for (const o of ["booked", "rescheduled", "cancelled", "callback", "handoff"] as const) {
      if (this.used.has(o)) return o;
    }
    return "info";
  }

  private metrics(): Record<string, number> {
    const m: Record<string, number> = {
      userTurns: this.userTurns,
      assistantTurns: this.assistantTurns,
      toolCalls: this.toolCalls,
    };
    if (this.latencies.length) {
      m["avgLatencyMs"] = Math.round(
        this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length,
      );
    }
    return m;
  }

  // ------------------------------------------------------------------ persistence

  private persist(input: {
    seq: number;
    role: "user" | "assistant" | "tool";
    text?: string;
    toolName?: string;
    toolArgs?: unknown;
    toolResult?: unknown;
    latencyMs?: number;
    startedAt?: Date;
  }): void {
    this.persistChain = this.persistChain.then(async () => {
      try {
        await appendTurn(this.db, {
          callId: this.ctx.callId,
          clinicId: this.ctx.clinic.clinic.id,
          ...input,
        });
      } catch (e) {
        this.log.error("appendTurn failed", { code: errCode(e), role: input.role });
      }
    });
  }

  // ------------------------------------------------------------------ speech output

  private speaker(): string {
    return (
      this.ctx.clinic.assistant?.voices?.[this.language] ??
      LANGUAGES.find((l) => l.code === this.language)?.sarvamSpeaker ??
      "shubh"
    );
  }

  /** When a spoken turn began: its first audio chunk, else when it was queued, else now. */
  private spokenAt(r: SpokenRound): Date {
    return new Date(r.firstAudioAt ?? r.enqueuedAt ?? this.ctx.now().getTime());
  }

  private enqueueSpeech(
    text: string,
    epoch: number,
    spoken?: SpokenRound,
    disclosure = false,
  ): void {
    if (this.ended || epoch !== this.epoch || !text.trim()) return;
    if (spoken) spoken.enqueuedAt ??= this.ctx.now().getTime();
    this.speechQueue.push({
      text,
      epoch,
      ...(spoken ? { spoken } : {}),
      ...(disclosure ? { disclosure } : {}),
    });
    if (!this.pumpActive) {
      this.pumpActive = true;
      this.pumpPromise = this.pump();
    }
  }

  private async pump(): Promise<void> {
    for (;;) {
      const item = this.speechQueue.shift();
      if (!item) {
        this.pumpActive = false;
        return;
      }
      if (item.epoch !== this.epoch || this.ended) {
        if (item.disclosure) this.disclosurePending = false;
        continue;
      }
      this.setState("speaking");
      const round = item.spoken;
      let utt: TtsUtterance | null = null;
      let carry: Buffer | null = null; // PCM16 needs even byte lengths; hold a split sample
      try {
        utt = this.tts.speak(item.text, { language: this.language, speaker: this.speaker() });
        this.currentUtt = utt;
        for await (const chunk of utt.audio) {
          // A cancelled utterance may still deliver a late chunk; the epoch check drops it.
          if (item.epoch !== this.epoch || this.ended) {
            utt.cancel();
            break;
          }
          if (this.turn && this.turn.epoch === item.epoch && this.turn.firstAudioAt === undefined) {
            this.turn.firstAudioAt = this.ctx.now().getTime();
          }
          if (item.spoken) {
            item.spoken.started++;
            item.spoken = undefined; // count each sentence once
          }
          let out: Buffer = carry ? Buffer.concat([carry, chunk]) : chunk;
          carry = null;
          if (out.length % 2 === 1) {
            carry = out.subarray(out.length - 1);
            out = out.subarray(0, out.length - 1);
          }
          if (out.length === 0) continue;
          this.noteAudioSent(out.length);
          if (round) round.firstAudioAt ??= this.ctx.now().getTime();
          this.transport.sendAudio(out);
          this.recorder?.assistant(out);
        }
      } catch (e) {
        // The provider already retried; skip this utterance and stay in the call.
        if (item.epoch === this.epoch) this.log.error("tts utterance failed", { code: errCode(e) });
      } finally {
        if (item.disclosure) this.disclosurePending = false;
        if (this.currentUtt === utt) this.currentUtt = null;
      }
    }
  }

  private noteAudioSent(bytes: number): void {
    const now = this.ctx.now().getTime();
    this.lastAudioSentAt = now;
    this.playbackEndsAt = Math.max(this.playbackEndsAt, now) + bytes / BYTES_PER_MS;
  }

  private async drain(): Promise<void> {
    while (this.pumpActive && this.pumpPromise) await this.pumpPromise;
  }

  private speakGreeting(): void {
    const { disclosure, greeting } = openingUtterances(
      this.ctx.clinic.assistant,
      this.ctx.clinic.clinic,
      this.language,
      { recorded: this.recorder !== null },
    );
    const epoch = this.epoch;
    const seq = this.seq++;
    const opening: SpokenRound = { started: 0 };
    let written = false;
    const write = () => {
      if (written) return;
      written = true;
      this.pendingRows.delete(write);
      this.persist({
        seq,
        role: "assistant",
        text: `${disclosure} ${greeting}`,
        startedAt: this.spokenAt(opening),
      });
    };
    // Written once the audio has played (so it is stamped with the first chunk), or at call end.
    this.pendingRows.add(write);
    this.assistantTurns++;
    // The disclosure is a privacy promise: barge-in is ignored until it has been sent.
    this.disclosurePending = true;
    this.enqueueSpeech(disclosure, epoch, opening, true);
    this.enqueueSpeech(greeting, epoch, opening);
    void this.drain().then(() => {
      write();
      if (!this.ended && epoch === this.epoch) this.setState("listening");
    });
  }

  // ------------------------------------------------------------------ barge-in

  private onSpeechStart(): void {
    if (this.ended || this.disclosurePending) return;
    if (this.state === "thinking" || this.state === "speaking") {
      this.interrupt();
      return;
    }
    // Listening, but the server sends faster than realtime: the client may still be playing
    // buffered audio. Flush it (idempotent on the client).
    const now = this.ctx.now().getTime();
    if (
      this.lastAudioSentAt > 0 &&
      (now - this.lastAudioSentAt < LATE_BARGE_IN_MS || now < this.playbackEndsAt)
    ) {
      this.lastAudioSentAt = 0;
      this.playbackEndsAt = 0;
      this.transport.sendEvent({ type: "flush_playback" });
      this.recorder?.truncateAssistant();
    }
  }

  private interrupt(): void {
    if (this.disclosurePending) return;
    this.epoch++;
    if (!this.forcedEnd) this.endRequested = false; // barge-in during the closing sentence cancels the hang-up
    this.lastAudioSentAt = 0;
    this.playbackEndsAt = 0;
    this.turnAbort?.abort();
    this.speechQueue.length = 0;
    this.currentUtt?.cancel();
    this.transport.sendEvent({ type: "flush_playback" });
    this.recorder?.truncateAssistant();
    if (this.state !== "listening") {
      this.log.info("state", { from: this.state, to: "listening" });
      this.state = "listening";
      this.transport.sendEvent({ type: "state", state: "listening" });
    }
  }

  // ------------------------------------------------------------------ conversation

  private onTranscript(t: { text: string; language?: string }): void {
    if (this.ended) return;
    const text = t.text.trim();
    if (!text) {
      this.speechStartAt = null;
      return; // silence or noise: stay listening, no LLM call
    }
    if (isLanguageCode(t.language) && this.enabledLanguages().includes(t.language)) {
      this.language = t.language;
      this.detectedLanguage = t.language;
    }
    // A turn that is queued or running counts as busy even before it flips the state.
    if (this.state !== "listening" || this.turnsPending > 0) this.interrupt();
    const now = this.ctx.now().getTime();
    const epoch = this.epoch;
    const ac = new AbortController();
    this.turnAbort = ac;
    const speechEndAt = this.speechEndAt ?? now;
    const speechStartAt = Math.min(this.speechStartAt ?? now, now);
    this.speechStartAt = null;
    const sttMs = this.speechEndAt !== null ? now - this.speechEndAt : null;
    this.speechEndAt = null;
    this.turnsPending++;
    this.turnChain = this.turnChain
      .then(() => this.runTurn(text, t.language, epoch, speechEndAt, speechStartAt, sttMs, ac))
      .catch(() => this.providerError("turn"))
      .finally(() => {
        this.turnsPending--;
      });
  }

  private enabledLanguages(): string[] {
    return this.ctx.clinic.clinic.languages as string[];
  }

  private pushUser(blocks: NonNullable<ConverseMessage["content"]>): void {
    const last = this.messages[this.messages.length - 1];
    if (last?.role === "user") last.content = [...(last.content ?? []), ...blocks];
    else this.messages.push({ role: "user", content: blocks });
  }

  /** Last 30 messages, starting on a plain user message so tool pairs are never split. */
  private windowedMessages(): ConverseMessage[] {
    let w = this.messages.slice(-MAX_MESSAGES);
    while (
      w.length > 0 &&
      (w[0]!.role !== "user" || (w[0]!.content ?? []).some((b) => b.toolResult || !b.text))
    ) {
      w = w.slice(1);
    }
    return w;
  }

  private async runTurn(
    userText: string,
    language: string | undefined,
    epoch: number,
    speechEndAt: number,
    speechStartAt: number,
    sttMs: number | null,
    ac: AbortController,
  ): Promise<void> {
    if (this.ended) return;
    if (epoch !== this.epoch) {
      // Superseded by a newer utterance before it started: keep the context (history, transcript,
      // persistence) but do not call the LLM; the newer turn answers both.
      this.userTurns++;
      this.persist({
        seq: this.seq++,
        role: "user",
        text: userText,
        startedAt: new Date(speechStartAt),
      });
      this.transport.sendEvent({
        type: "transcript",
        role: "user",
        text: userText,
        ...(language ? { language } : {}),
        final: true,
      });
      this.pushUser([{ text: userText }]);
      return;
    }
    const turn: TurnInfo = { epoch, speechEndAt, sttMs };
    this.turn = turn;
    const live = () => !this.ended && epoch === this.epoch && !ac.signal.aborted;

    this.setState("thinking");
    this.userTurns++;
    this.persist({
      seq: this.seq++,
      role: "user",
      text: userText,
      startedAt: new Date(speechStartAt),
    });
    this.transport.sendEvent({
      type: "transcript",
      role: "user",
      text: userText,
      ...(language ? { language } : {}),
      final: true,
    });
    this.pushUser([{ text: userText }]);

    const assistantSeqs: Array<{ seq: number; text: string; round: SpokenRound }> = [];
    let toolRoundsDone = 0;
    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS && live(); round++) {
        const queue = new TextQueue();
        const sentences: string[] = [];
        const spoken: SpokenRound = { started: 0 };
        const speaking = (async () => {
          for await (const sentence of chunkSentences(queue)) {
            sentences.push(sentence);
            turn.firstSentenceAt ??= this.ctx.now().getTime();
            this.enqueueSpeech(sentence, epoch, spoken);
          }
        })();

        let text = "";
        let stopReason = "";
        turn.llmStartAt ??= this.ctx.now().getTime();
        const calls: Array<{ id: string; name: ToolName; input: unknown }> = [];
        try {
          const stream = this.llm.stream({
            system: buildSystemPrompt(this.ctx.clinic, this.ctx.now().toISOString(), this.language),
            messages: this.windowedMessages(),
            tools: TOOLS,
            signal: ac.signal,
          });
          for await (const d of stream) {
            if (!live()) break;
            if (d.type === "text") {
              if (!d.text.trim() && !text) continue;
              turn.llmFirstTokenAt ??= this.ctx.now().getTime();
              text += d.text;
              queue.push(d.text);
            } else if (d.type === "tool_call") {
              calls.push({ id: d.id, name: d.name, input: d.input });
            } else if (d.type === "done") {
              stopReason = d.stopReason;
            }
          }
        } catch (e) {
          if (live()) {
            this.log.error("llm error", { code: errCode(e) });
            queue.close();
            await speaking;
            // Say something rather than cutting off silently, then end as a provider failure.
            const fb = FALLBACK[this.language];
            this.enqueueSpeech(fb, epoch);
            await this.drain();
            this.providerError("llm");
            return;
          }
        }
        queue.close();
        await speaking;
        if (stopReason === "max_tokens" && calls.length > 0) {
          // A truncated tool block would parse as `{}`; do not run it.
          this.log.warn("llm output truncated; dropping tool calls", { dropped: calls.length });
          calls.length = 0;
        }

        text = text.trim();
        // After a barge-in only the sentences whose audio actually started count as said.
        const interrupted = !live();
        if (interrupted && text) {
          text = sentences.slice(0, spoken.started).join(" ").trim();
          if (text) text += "…";
        }
        const assistantBlocks: NonNullable<ConverseMessage["content"]> = [];
        if (text) assistantBlocks.push({ text });
        // After a barge-in the pending tool calls are dropped (not executed, not recorded) so toolUse stays paired.
        if (calls.length > 0 && live()) {
          for (const c of calls) {
            assistantBlocks.push({
              toolUse: { toolUseId: c.id, name: c.name, input: (c.input ?? {}) as never },
            });
          }
        }
        if (assistantBlocks.length > 0)
          this.messages.push({ role: "assistant", content: assistantBlocks });
        if (text) {
          const seq = this.seq++;
          this.assistantTurns++;
          assistantSeqs.push({ seq, text, round: spoken });
          if (!this.ended && epoch === this.epoch) {
            this.transport.sendEvent({ type: "transcript", role: "assistant", text, final: true });
          }
        }
        if (calls.length === 0 || !live()) break;
        toolRoundsDone++;

        const results: NonNullable<ConverseMessage["content"]> = [];
        const refused = (id: string, error: string) =>
          results.push({
            toolResult: {
              toolUseId: id,
              content: [{ text: JSON.stringify({ error }) }],
              status: "error",
            },
          });
        for (const [idx, c] of calls.entries()) {
          // Every toolUse needs a toolResult; calls that must not run get a synthetic error.
          if (idx >= MAX_TOOLS_PER_ROUND) {
            refused(c.id, "too_many_tools");
            continue;
          }
          if (!live()) {
            refused(c.id, "interrupted");
            continue;
          }
          this.toolCalls++;
          const toolStartedAt = this.ctx.now();
          this.transport.sendEvent({ type: "tool", name: c.name, status: "started", summary: "" });
          // State-changing tools are counted before they run so a hang-up mid-transaction still
          // records the outcome; a failure takes the mark back.
          const mark = TOOL_OUTCOME[c.name];
          const had = mark !== undefined && this.used.has(mark);
          if (mark) this.used.add(mark);
          const out = await executeTool(this.db, this.toolCtx(), c.name, c.input);
          const failed = isError(out.result);
          if (failed && mark && !had) this.used.delete(mark);
          this.transport.sendEvent({
            type: "tool",
            name: c.name,
            status: failed ? "failed" : "done",
            summary: summarizeResult(c.name, out.result),
          });
          if (!failed) this.noteToolSuccess(c.name, live());
          if (out.event) this.transport.sendEvent(out.event);
          this.persist({
            seq: this.seq++,
            role: "tool",
            toolName: c.name,
            toolArgs: c.input,
            toolResult: out.result,
            startedAt: toolStartedAt,
          });
          results.push({
            toolResult: {
              toolUseId: c.id,
              content: [{ text: JSON.stringify(out.result) }],
              status: failed ? "error" : "success",
            },
          });
        }
        this.pushUser(results);
        // end_call alongside spoken text already contains the goodbye; otherwise let the model say it.
        if (this.endRequested && text) break;
      }
      if (toolRoundsDone >= MAX_TOOL_ROUNDS && live() && !this.endRequested) {
        // The model is looping on tools: hand over to staff instead of going silent.
        this.log.warn("tool round cap reached", { rounds: toolRoundsDone });
        const fb = FALLBACK[this.language];
        this.transport.sendEvent({
          type: "tool",
          name: "transfer_to_staff",
          status: "done",
          summary: "ok",
        });
        this.used.add("handoff");
        this.persist({
          seq: this.seq++,
          role: "tool",
          toolName: "transfer_to_staff",
          toolArgs: { reason: "not_understood" },
          toolResult: { transferred: true, automatic: true },
        });
        this.assistantTurns++;
        const fbRound: SpokenRound = { started: 0 };
        assistantSeqs.push({ seq: this.seq++, text: fb, round: fbRound });
        this.transport.sendEvent({ type: "transcript", role: "assistant", text: fb, final: true });
        this.endRequested = true;
        this.forcedEnd = true;
        this.enqueueSpeech(fb, epoch, fbRound);
      }
    } finally {
      await this.drain();
      this.log.info("turn", {
        turn: this.userTurns,
        sttMs: turn.sttMs,
        llmFirstTokenMs:
          turn.llmFirstTokenAt !== undefined && turn.llmStartAt !== undefined
            ? turn.llmFirstTokenAt - turn.llmStartAt
            : null,
        ttsFirstAudioMs:
          turn.firstAudioAt !== undefined &&
          (turn.firstSentenceAt ?? turn.llmFirstTokenAt) !== undefined
            ? turn.firstAudioAt - (turn.firstSentenceAt ?? turn.llmFirstTokenAt!)
            : null,
      });
      for (const a of assistantSeqs) {
        const latencyMs =
          a === assistantSeqs[0] && turn.firstAudioAt !== undefined
            ? turn.firstAudioAt - turn.speechEndAt
            : undefined;
        if (latencyMs !== undefined) this.latencies.push(latencyMs);
        this.persist({
          seq: a.seq,
          role: "assistant",
          text: a.text,
          startedAt: this.spokenAt(a.round),
          ...(latencyMs !== undefined ? { latencyMs } : {}),
        });
      }
    }

    if (this.ended) return;
    if (this.forcedEnd) {
      await this.finish("assistant", false);
      return;
    }
    if (epoch !== this.epoch) return;
    if (this.endRequested) {
      await this.finish("assistant", false);
      return;
    }
    if (!ac.signal.aborted) this.setState("listening");
  }

  private noteToolSuccess(name: ToolName, live: boolean): void {
    const mark = TOOL_OUTCOME[name];
    if (mark) this.used.add(mark);
    else if (name === "end_call" && live) this.endRequested = true;
  }

  private toolCtx(): ToolContext {
    this.tctx.language = this.language;
    return this.tctx;
  }
}

function isError(result: unknown): boolean {
  return typeof result === "object" && result !== null && "error" in result;
}

function errCode(e: unknown): string {
  if (e && typeof e === "object") {
    const o = e as { code?: unknown; name?: unknown };
    if (typeof o.code === "string") return o.code;
    if (typeof o.name === "string") return o.name;
  }
  return "unknown";
}
