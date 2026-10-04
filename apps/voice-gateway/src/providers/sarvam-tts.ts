import type { LanguageCode } from "@muxaris/shared";
import type { TtsProvider, TtsUtterance } from "./types.js";
import {
  AsyncQueue,
  defaultWsFactory,
  sarvamHeaders,
  sarvamProtocols,
  serverErrorDetail,
  toError,
  type WsFactory,
  type WsLike,
} from "./ws-util.js";

export const TTS_URL =
  "wss://api.sarvam.ai/text-to-speech/ws?model=bulbul:v3&send_completion_event=true";

const INACTIVITY_MS = 10_000;

export interface SarvamTtsOptions {
  apiKey: string;
  wsFactory?: WsFactory;
  url?: string;
}

export class SarvamTts implements TtsProvider {
  private readonly apiKey: string;
  private readonly wsFactory: WsFactory;
  private readonly url: string;

  constructor(opts: SarvamTtsOptions) {
    this.apiKey = opts.apiKey;
    this.wsFactory = opts.wsFactory ?? defaultWsFactory;
    this.url = opts.url ?? TTS_URL;
  }

  speak(
    text: string,
    opts: { language: LanguageCode; speaker: string; warm?: boolean },
  ): TtsUtterance {
    // TODO: opts.warm (pre-connected socket) is ignored for now.
    let cancelNow: () => void = () => {};
    const queue = new AsyncQueue<Buffer>(() => cancelNow());
    let timer: ReturnType<typeof setTimeout> | null = null;
    const arm = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(
        () => finish(new Error("Sarvam TTS timed out waiting for the server")),
        INACTIVITY_MS,
      );
    };
    let done = false;
    let ws: WsLike | null = null;

    const finish = (err?: Error, drop = false): void => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      if (err) queue.fail(err);
      else if (drop) queue.abort();
      else queue.end();
      try {
        ws?.close();
      } catch {
        /* already closed */
      }
    };

    try {
      ws = this.wsFactory(this.url, sarvamHeaders(this.apiKey), sarvamProtocols(this.apiKey));
    } catch (e) {
      finish(toError(e));
      return { audio: queue, cancel: () => finish(undefined, true) };
    }
    const sock = ws;
    cancelNow = () => finish(undefined, true);
    arm();
    sock.on("open", () => {
      if (done) return;
      arm();
      // SPIKES: the config field is `language_code` (not `target_language_code`) and the
      // model is selected through the URL query string.
      sock.send(
        JSON.stringify({
          type: "config",
          data: {
            language_code: opts.language,
            speaker: opts.speaker,
            pace: 1,
            speech_sample_rate: 24000,
            output_audio_codec: "linear16",
            min_buffer_size: 30,
            max_chunk_length: 150,
          },
        }),
      );
      sock.send(JSON.stringify({ type: "text", data: { text } }));
      sock.send(JSON.stringify({ type: "flush" }));
    });
    sock.on("message", (raw: unknown) => {
      if (done) return;
      arm();
      let msg: { type?: string; data?: Record<string, unknown> };
      try {
        msg = JSON.parse(String(raw));
      } catch {
        finish(new Error("Sarvam TTS sent non-JSON message"));
        return;
      }
      const data = msg.data ?? {};
      if (msg.type === "audio" && typeof data["audio"] === "string") {
        const pcm = Buffer.from(data["audio"], "base64");
        if (pcm.length > 0) queue.push(pcm);
      } else if (msg.type === "event" && data["event_type"] === "final") {
        finish();
      } else if (msg.type === "error") {
        finish(new Error(`Sarvam TTS error: ${serverErrorDetail(data)}`));
      }
    });
    sock.on("error", (e: unknown) => finish(toError(e)));
    sock.on("close", () => finish(new Error("Sarvam TTS socket closed before final event")));

    return { audio: queue, cancel: () => finish(undefined, true) };
  }

  /** Synthesises the whole text and returns the concatenated PCM16 24 kHz audio. */
  async preview(
    text: string,
    opts: { language: LanguageCode; speaker: string; warm?: boolean },
  ): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const c of this.speak(text, opts).audio) chunks.push(c);
    return Buffer.concat(chunks);
  }
}
