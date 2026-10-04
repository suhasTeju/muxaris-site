import type { SttProvider, SttStream } from "./types.js";
import {
  defaultWsFactory,
  sarvamHeaders,
  toError,
  type WsFactory,
  type WsLike,
} from "./ws-util.js";

export const STT_URL =
  "wss://api.sarvam.ai/speech-to-text/ws?model=saaras:v4&language-code=unknown&mode=codemix&sample_rate=16000&input_audio_codec=pcm_s16le&vad_signals=true";
/** 100 ms of PCM16 mono at 16 kHz. */
export const STT_FRAME_BYTES = 3200;

export interface SarvamSttOptions {
  apiKey: string;
  wsFactory?: WsFactory;
  url?: string;
}

export class SarvamStt implements SttProvider {
  private readonly apiKey: string;
  private readonly wsFactory: WsFactory;
  private readonly url: string;

  constructor(opts: SarvamSttOptions) {
    this.apiKey = opts.apiKey;
    this.wsFactory = opts.wsFactory ?? defaultWsFactory;
    this.url = opts.url ?? STT_URL;
  }

  open(): Promise<SttStream> {
    return new Promise<SttStream>((resolve, reject) => {
      let ws: WsLike;
      try {
        ws = this.wsFactory(this.url, sarvamHeaders(this.apiKey));
      } catch (e) {
        reject(toError(e));
        return;
      }
      let opened = false;
      const stream = new SarvamSttStream(ws);
      ws.on("open", () => {
        opened = true;
        resolve(stream);
      });
      ws.on("error", (e: unknown) => {
        if (!opened) reject(toError(e));
        else stream.fail(toError(e));
      });
      ws.on("close", () => {
        if (!opened) reject(new Error("Sarvam STT socket closed before open"));
        else stream.handleClose();
      });
      ws.on("message", (data: unknown) => stream.handleMessage(String(data)));
    });
  }
}

type Listeners = {
  speech_start: Array<() => void>;
  speech_end: Array<() => void>;
  transcript: Array<(t: { text: string; language?: string }) => void>;
  error: Array<(e: Error) => void>;
};

class SarvamSttStream implements SttStream {
  private pending: Buffer = Buffer.alloc(0);
  private ended = false;
  private closed = false;
  private listeners: Listeners = { speech_start: [], speech_end: [], transcript: [], error: [] };

  constructor(private readonly ws: WsLike) {}

  on(ev: "speech_start" | "speech_end", cb: () => void): void;
  on(ev: "transcript", cb: (t: { text: string; language?: string }) => void): void;
  on(ev: "error", cb: (e: Error) => void): void;
  on(ev: keyof Listeners, cb: (...args: never[]) => void): void {
    (this.listeners[ev] as Array<(...args: never[]) => void>).push(cb);
  }

  sendAudio(pcm16k: Buffer): void {
    if (this.ended || this.closed || pcm16k.length === 0) return;
    this.pending = this.pending.length === 0 ? pcm16k : Buffer.concat([this.pending, pcm16k]);
    while (this.pending.length >= STT_FRAME_BYTES) {
      this.sendFrame(this.pending.subarray(0, STT_FRAME_BYTES));
      this.pending = this.pending.subarray(STT_FRAME_BYTES);
    }
  }

  end(): void {
    if (this.ended || this.closed) return;
    this.ended = true;
    if (this.pending.length > 0) {
      const frame = Buffer.alloc(STT_FRAME_BYTES);
      this.pending.copy(frame);
      this.pending = Buffer.alloc(0);
      this.sendFrame(frame);
    }
    this.ws.send(JSON.stringify({ type: "flush" }));
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.ws.close();
  }

  private sendFrame(frame: Buffer): void {
    this.ws.send(
      JSON.stringify({
        audio: { data: frame.toString("base64"), sample_rate: "16000", encoding: "audio/wav" },
      }),
    );
  }

  handleMessage(raw: string): void {
    let msg: unknown;
    try {
      msg = JSON.parse(raw);
    } catch {
      this.emitError(new Error(`Sarvam STT sent non-JSON message: ${raw.slice(0, 200)}`));
      return;
    }
    if (typeof msg !== "object" || msg === null) {
      this.emitError(new Error("Sarvam STT sent unexpected message"));
      return;
    }
    const m = msg as { type?: unknown; data?: Record<string, unknown> };
    const data = m.data ?? {};
    if (m.type === "events") {
      if (data["signal_type"] === "START_SPEECH") this.listeners.speech_start.forEach((cb) => cb());
      else if (data["signal_type"] === "END_SPEECH")
        this.listeners.speech_end.forEach((cb) => cb());
    } else if (m.type === "data") {
      const text = typeof data["transcript"] === "string" ? data["transcript"] : "";
      const language = data["language_code"];
      const t: { text: string; language?: string } = { text };
      if (typeof language === "string") t.language = language;
      this.listeners.transcript.forEach((cb) => cb(t));
    } else if (m.type === "error") {
      const detail = typeof data["message"] === "string" ? data["message"] : JSON.stringify(data);
      this.emitError(new Error(`Sarvam STT error: ${detail}`));
    }
  }

  handleClose(): void {
    if (this.closed) return;
    this.closed = true;
    if (!this.ended) this.emitError(new Error("Sarvam STT socket closed before end()"));
  }

  fail(e: Error): void {
    if (this.closed) return;
    this.emitError(e);
  }

  private emitError(e: Error): void {
    this.listeners.error.forEach((cb) => cb(e));
  }
}
