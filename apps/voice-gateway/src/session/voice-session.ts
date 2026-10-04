import { appendTurn, finishCall } from "@muxaris/core";
import type { Db } from "@muxaris/db";
import {
  ASSISTANT_TOOLS,
  LANGUAGES,
  LANGUAGE_CODES,
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
import { buildSystemPrompt, type ClinicContext } from "./prompt.js";
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
  /** Verified caller ID on phone calls; undefined for browser calls. */
  callerPhone?: string | undefined;
  /** Number first claimed by the caller in this call (managed by executeTool). */
  claimedPhone?: string | undefined;
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
}

type CallOutcome =
  "booked" | "rescheduled" | "cancelled" | "info" | "callback" | "handoff" | "abandoned";

const MAX_MESSAGES = 30;
const MAX_TOOL_ROUNDS = 6;
const USAGE_INTERVAL_MS = 30_000;
const TOOLS = toBedrockTools(ASSISTANT_TOOLS);

const isLanguageCode = (s: string | undefined): s is LanguageCode =>
  s !== undefined && (LANGUAGE_CODES as readonly string[]).includes(s);

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

interface SpeechItem {
  text: string;
  epoch: number;
}

interface TurnInfo {
  epoch: number;
  speechEndAt: number;
  firstAudioAt?: number;
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

  private stt: SttStream | null = null;
  private language: LanguageCode;
  private detectedLanguage: LanguageCode | undefined;
  private state: "listening" | "thinking" | "speaking" | null = null;
  private started = false;
  private ended = false;
  private startedAt = 0;

  /** Bumped on every barge-in: anything tagged with an older epoch is stale and dropped. */
  private epoch = 0;
  private turnAbort: AbortController | null = null;
  private turnChain: Promise<void> = Promise.resolve();
  private turn: TurnInfo | null = null;
  private speechEndAt: number | null = null;
  private endRequested = false;

  private speechQueue: SpeechItem[] = [];
  private pumpActive = false;
  private pumpPromise: Promise<void> | null = null;
  private currentUtt: TtsUtterance | null = null;

  private messages: ConverseMessage[] = [];
  private seq = 0;
  private persistChain: Promise<void> = Promise.resolve();
  private userTurns = 0;
  private assistantTurns = 0;
  private toolCalls = 0;
  private latencies: number[] = [];
  private used = new Set<"booked" | "rescheduled" | "cancelled" | "callback" | "handoff">();

  private readonly tctx: ToolContext;
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
    this.tctx = {
      clinic: deps.ctx.clinic,
      callId: deps.ctx.callId,
      language: deps.ctx.language,
      now: deps.ctx.now,
      callerPhone: deps.ctx.callerPhone,
      claimedPhone: deps.ctx.claimedPhone,
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
      stt.on("speech_start", () => this.onSpeechStart());
      stt.on("speech_end", () => {
        this.speechEndAt = this.ctx.now().getTime();
      });
      stt.on("transcript", (t) => this.onTranscript(t));
      stt.on("error", () => this.providerError("stt"));
      this.transport.onInboundAudio((pcm) => {
        if (!this.ended) this.stt?.sendAudio(pcm);
      });
    } catch {
      this.providerError("stt_open");
      return;
    }

    this.log.info("session started", { callId: this.ctx.callId, language: this.language });
    this.speakGreeting();
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
    await this.persistChain;
    const outcome = this.outcome();
    const durationS = Math.max(0, Math.round((this.ctx.now().getTime() - this.startedAt) / 1000));
    try {
      await finishCall(this.db, {
        callId: this.ctx.callId,
        clinicId: this.ctx.clinic.clinic.id,
        status: reason === "error" ? "failed" : "completed",
        outcome,
        durationS,
        ...(this.detectedLanguage ? { languageDetected: this.detectedLanguage } : {}),
        metrics: this.metrics(),
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

  private enqueueSpeech(text: string, epoch: number): void {
    if (this.ended || epoch !== this.epoch || !text.trim()) return;
    this.speechQueue.push({ text, epoch });
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
      if (item.epoch !== this.epoch || this.ended) continue;
      this.setState("speaking");
      let utt: TtsUtterance | null = null;
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
          this.transport.sendAudio(chunk);
        }
      } catch {
        if (item.epoch === this.epoch) this.providerError("tts");
      } finally {
        if (this.currentUtt === utt) this.currentUtt = null;
      }
    }
  }

  private async drain(): Promise<void> {
    while (this.pumpActive && this.pumpPromise) await this.pumpPromise;
  }

  private speakGreeting(): void {
    const a = this.ctx.clinic.assistant;
    const text =
      a?.greeting?.[this.language] ??
      Object.values(a?.greeting ?? {}).find((g) => g.trim()) ??
      `Hello, this is ${a?.name ?? "the receptionist"} at ${this.ctx.clinic.clinic.name}. How can I help you?`;
    const epoch = this.epoch;
    this.persist({ seq: this.seq++, role: "assistant", text });
    this.assistantTurns++;
    this.enqueueSpeech(text, epoch);
    void this.drain().then(() => {
      if (!this.ended && epoch === this.epoch) this.setState("listening");
    });
  }

  // ------------------------------------------------------------------ barge-in

  private onSpeechStart(): void {
    if (this.ended) return;
    if (this.state === "thinking" || this.state === "speaking") this.interrupt();
  }

  private interrupt(): void {
    this.epoch++;
    this.turnAbort?.abort();
    this.speechQueue.length = 0;
    this.currentUtt?.cancel();
    this.transport.sendEvent({ type: "flush_playback" });
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
    if (!text) return; // silence or noise: stay listening, no LLM call
    if (isLanguageCode(t.language)) {
      this.language = t.language;
      this.detectedLanguage = t.language;
    }
    if (this.state !== "listening") this.interrupt();
    const now = this.ctx.now().getTime();
    const epoch = this.epoch;
    const ac = new AbortController();
    this.turnAbort = ac;
    const speechEndAt = this.speechEndAt ?? now;
    this.speechEndAt = null;
    this.turnChain = this.turnChain
      .then(() => this.runTurn(text, t.language, epoch, speechEndAt, ac))
      .catch(() => this.providerError("turn"));
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
    ac: AbortController,
  ): Promise<void> {
    if (this.ended || epoch !== this.epoch) return;
    const turn: TurnInfo = { epoch, speechEndAt };
    this.turn = turn;
    const live = () => !this.ended && epoch === this.epoch && !ac.signal.aborted;

    this.setState("thinking");
    this.userTurns++;
    this.persist({ seq: this.seq++, role: "user", text: userText });
    this.transport.sendEvent({
      type: "transcript",
      role: "user",
      text: userText,
      ...(language ? { language } : {}),
      final: true,
    });
    this.pushUser([{ text: userText }]);

    const assistantSeqs: Array<{ seq: number; text: string }> = [];
    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS && live(); round++) {
        const queue = new TextQueue();
        const speaking = (async () => {
          for await (const sentence of chunkSentences(queue)) this.enqueueSpeech(sentence, epoch);
        })();

        let text = "";
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
              text += d.text;
              queue.push(d.text);
            } else if (d.type === "tool_call") {
              calls.push({ id: d.id, name: d.name, input: d.input });
            }
          }
        } catch (e) {
          if (live()) {
            this.log.error("llm error", { code: errCode(e) });
            queue.close();
            await speaking;
            this.providerError("llm");
            return;
          }
        }
        queue.close();
        await speaking;

        text = text.trim();
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
          assistantSeqs.push({ seq, text });
          if (!this.ended && epoch === this.epoch) {
            this.transport.sendEvent({ type: "transcript", role: "assistant", text, final: true });
          }
        }
        if (calls.length === 0 || !live()) break;

        const results: NonNullable<ConverseMessage["content"]> = [];
        for (const c of calls) {
          this.toolCalls++;
          this.transport.sendEvent({ type: "tool", name: c.name, status: "started", summary: "" });
          const out = await executeTool(this.db, this.toolCtx(), c.name, c.input);
          const failed = isError(out.result);
          this.transport.sendEvent({
            type: "tool",
            name: c.name,
            status: failed ? "failed" : "done",
            summary: summarizeResult(c.name, out.result),
          });
          if (!failed) this.noteToolSuccess(c.name);
          if (out.event) this.transport.sendEvent(out.event);
          this.persist({
            seq: this.seq++,
            role: "tool",
            toolName: c.name,
            toolArgs: c.input,
            toolResult: out.result,
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
    } finally {
      await this.drain();
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
          ...(latencyMs !== undefined ? { latencyMs } : {}),
        });
      }
    }

    if (this.ended || epoch !== this.epoch) return;
    if (this.endRequested) {
      await this.finish("assistant", false);
      return;
    }
    if (!ac.signal.aborted) this.setState("listening");
  }

  private noteToolSuccess(name: ToolName): void {
    if (name === "book_appointment") this.used.add("booked");
    else if (name === "reschedule_appointment") this.used.add("rescheduled");
    else if (name === "cancel_appointment") this.used.add("cancelled");
    else if (name === "request_callback") this.used.add("callback");
    else if (name === "transfer_to_staff") this.used.add("handoff");
    else if (name === "end_call") this.endRequested = true;
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
