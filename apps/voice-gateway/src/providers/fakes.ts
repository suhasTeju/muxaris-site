import type { LanguageCode } from "@muxaris/shared";
import type {
  ConverseMessage,
  LlmDelta,
  LlmProvider,
  SttProvider,
  SttStream,
  TtsProvider,
  TtsUtterance,
} from "./types.js";

// ---------------------------------------------------------------- STT

export type FakeSttEvent =
  | { type: "speech_start" }
  | { type: "speech_end" }
  | { type: "transcript"; text: string; language?: string }
  | { type: "error"; error: Error };

export interface FakeSttScriptItem {
  afterMs: number;
  event: FakeSttEvent;
}

export class FakeSttStream implements SttStream {
  readonly received: Buffer[] = [];
  ended = false;
  closed = false;
  private timers: Array<ReturnType<typeof setTimeout>> = [];
  private ls = {
    start: [] as Array<() => void>,
    end: [] as Array<() => void>,
    transcript: [] as Array<(t: { text: string; language?: string }) => void>,
    error: [] as Array<(e: Error) => void>,
  };

  constructor(script: FakeSttScriptItem[]) {
    for (const item of script) {
      this.timers.push(setTimeout(() => this.push(item.event), item.afterMs));
    }
  }

  on(ev: "speech_start" | "speech_end", cb: () => void): void;
  on(ev: "transcript", cb: (t: { text: string; language?: string }) => void): void;
  on(ev: "error", cb: (e: Error) => void): void;
  on(ev: string, cb: (...args: never[]) => void): void {
    const map: Record<string, Array<(...args: never[]) => void>> = {
      speech_start: this.ls.start,
      speech_end: this.ls.end,
      transcript: this.ls.transcript,
      error: this.ls.error,
    };
    map[ev]?.push(cb);
  }

  sendAudio(pcm16k: Buffer): void {
    this.received.push(pcm16k);
  }
  end(): void {
    this.ended = true;
  }
  close(): void {
    this.closed = true;
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  /** Emit an event immediately. */
  push(event: FakeSttEvent): void {
    if (this.closed) return;
    if (event.type === "speech_start") this.ls.start.forEach((cb) => cb());
    else if (event.type === "speech_end") this.ls.end.forEach((cb) => cb());
    else if (event.type === "transcript") {
      const t: { text: string; language?: string } = { text: event.text };
      if (event.language !== undefined) t.language = event.language;
      this.ls.transcript.forEach((cb) => cb(t));
    } else this.ls.error.forEach((cb) => cb(event.error));
  }
}

export class FakeStt implements SttProvider {
  readonly streams: FakeSttStream[] = [];
  constructor(private readonly script: FakeSttScriptItem[] = []) {}

  async open(): Promise<SttStream> {
    const s = new FakeSttStream(this.script);
    this.streams.push(s);
    return s;
  }
  /** Push an event into the most recently opened stream. */
  push(event: FakeSttEvent): void {
    this.streams[this.streams.length - 1]?.push(event);
  }
}

// ---------------------------------------------------------------- TTS

export interface FakeTtsOptions {
  chunks?: number;
  chunkBytes?: number;
  delayMs?: number;
}

export class FakeTts implements TtsProvider {
  readonly spoken: Array<{
    text: string;
    language: LanguageCode;
    speaker: string;
    warm?: boolean;
  }> = [];
  cancelCalls = 0;
  private readonly chunks: number;
  private readonly chunkBytes: number;
  private readonly delayMs: number;

  constructor(opts: FakeTtsOptions = {}) {
    this.chunks = opts.chunks ?? 3;
    this.chunkBytes = opts.chunkBytes ?? 960;
    this.delayMs = opts.delayMs ?? 20;
  }

  speak(
    text: string,
    opts: { language: LanguageCode; speaker: string; warm?: boolean },
  ): TtsUtterance {
    this.spoken.push({ text, ...opts });
    let cancelled = false;
    let wake: (() => void) | null = null;
    const { chunks, chunkBytes, delayMs } = this;

    async function* gen(): AsyncGenerator<Buffer> {
      if (cancelled) return;
      for (let i = 0; i < chunks; i++) {
        if (delayMs > 0) {
          await new Promise<void>((resolve) => {
            const t = setTimeout(resolve, delayMs);
            wake = () => {
              clearTimeout(t);
              resolve();
            };
          });
        } else {
          await Promise.resolve();
        }
        if (cancelled) return;
        yield Buffer.alloc(chunkBytes);
      }
    }

    return {
      audio: gen(),
      cancel: () => {
        if (cancelled) return;
        this.cancelCalls++;
        cancelled = true;
        (wake as (() => void) | null)?.();
      },
    };
  }
}

// ---------------------------------------------------------------- LLM

function lastUserText(messages: ConverseMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== "user") continue;
    const text = (m.content ?? [])
      .map((b) => b.text ?? "")
      .join("")
      .trim();
    if (text) return text;
  }
  return "";
}

export interface FakeLlmRequest {
  system: string;
  messages: ConverseMessage[];
}

export class FakeLlm implements LlmProvider {
  readonly requests: FakeLlmRequest[] = [];
  constructor(
    private readonly script: Record<string, LlmDelta[]> = {},
    private readonly defaultReply = "Okay.",
    private readonly delayMs = 0,
    /** Per-turn scripts consumed in order, one per stream() call; the keyed map is the fallback. */
    private readonly turns: LlmDelta[][] = [],
  ) {}

  async *stream(req: Parameters<LlmProvider["stream"]>[0]): AsyncGenerator<LlmDelta> {
    const turn = this.requests.length;
    this.requests.push({ system: req.system, messages: req.messages });
    const key = lastUserText(req.messages);
    const deltas: LlmDelta[] = this.turns[turn] ??
      this.script[key] ?? [{ type: "text", text: this.defaultReply }];
    const out = deltas.some((d) => d.type === "done")
      ? deltas
      : [
          ...deltas,
          {
            type: "done" as const,
            stopReason: deltas.some((d) => d.type === "tool_call") ? "tool_use" : "end_turn",
          },
        ];
    for (const d of out) {
      if (req.signal.aborted) return;
      if (this.delayMs > 0) {
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, this.delayMs);
          req.signal.addEventListener(
            "abort",
            () => {
              clearTimeout(t);
              resolve();
            },
            { once: true },
          );
        });
      }
      if (req.signal.aborted) return;
      yield d;
    }
  }
}
