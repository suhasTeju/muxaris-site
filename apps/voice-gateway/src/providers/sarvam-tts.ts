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
/** Waits before the 2nd and 3rd connection attempt when an utterance fails before any audio. */
export const TTS_RETRY_DELAYS_MS: readonly number[] = [300, 900];

export interface SarvamTtsOptions {
  apiKey: string;
  wsFactory?: WsFactory;
  url?: string;
  /** Backoff before each retry of an utterance that failed before producing audio. */
  retryDelaysMs?: readonly number[];
}

export class SarvamTts implements TtsProvider {
  private readonly apiKey: string;
  private readonly wsFactory: WsFactory;
  private readonly url: string;
  private readonly retryDelaysMs: readonly number[];

  constructor(opts: SarvamTtsOptions) {
    this.apiKey = opts.apiKey;
    this.wsFactory = opts.wsFactory ?? defaultWsFactory;
    this.url = opts.url ?? TTS_URL;
    this.retryDelaysMs = opts.retryDelaysMs ?? TTS_RETRY_DELAYS_MS;
  }

  /**
   * One utterance. A failure before the first audio chunk (handshake error such as 429/503,
   * socket drop, server error) is retried on a fresh socket after each delay in `retryDelaysMs`;
   * after that the audio iterable throws. Once audio has flowed there is no retry.
   */
  speak(
    text: string,
    opts: { language: LanguageCode; speaker: string; warm?: boolean },
  ): TtsUtterance {
    let cancelled = false;
    let current = this.speakOnce(text, opts); // first attempt starts immediately
    let wakeSleep: (() => void) | null = null;
    const delays = this.retryDelaysMs;
    const attempt = (n: number) => (n === 0 ? current : (current = this.speakOnce(text, opts)));

    async function* gen(): AsyncGenerator<Buffer> {
      for (let n = 0; ; n++) {
        if (cancelled) return;
        let produced = false;
        try {
          for await (const chunk of attempt(n).audio) {
            produced = true;
            yield chunk;
          }
          return;
        } catch (e) {
          if (produced || cancelled || n >= delays.length) throw e;
        }
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, delays[n]);
          wakeSleep = () => {
            clearTimeout(t);
            resolve();
          };
        });
        wakeSleep = null;
      }
    }

    const audio = gen();
    const cancel = (): void => {
      cancelled = true;
      current.cancel();
      wakeSleep?.();
    };
    // Stop the socket if the consumer abandons the iterator early.
    return {
      audio: {
        [Symbol.asyncIterator]: () => {
          const it = audio[Symbol.asyncIterator]();
          return {
            next: () => it.next(),
            return: async () => {
              cancel();
              return it.return(undefined);
            },
          };
        },
      },
      cancel,
    };
  }

  private speakOnce(
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
