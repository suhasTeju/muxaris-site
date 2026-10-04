import { gatewayEventSchema, type GatewayEvent, type LanguageCode } from "@muxaris/shared";
import { createMicCapture, type MicCapture } from "./audio-capture.js";
import { PcmPlayer, type PcmPlayerLike } from "./playback.js";

export interface SocketLike {
  binaryType: string;
  readyState: number;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onclose: ((ev: { code: number; reason: string }) => void) | null;
  send(data: string | ArrayBuffer | ArrayBufferView): void;
  close(code?: number, reason?: string): void;
}

export interface VoiceClientOptions {
  url: string;
  token: string;
  clinicId: string;
  language: LanguageCode;
  wsFactory?: (url: string) => SocketLike;
  mediaFactory?: () => MicCapture;
  playerFactory?: () => PcmPlayerLike;
}

export type VoiceClientEvents = {
  [K in GatewayEvent["type"]]: Extract<GatewayEvent, { type: K }>;
} & { audio: ArrayBuffer; close: { code: number; reason: string } };

type Listener = (payload: never) => void;
const OPEN = 1;

export class VoiceClient {
  private ws: SocketLike | null = null;
  private mic: MicCapture | null = null;
  private player: PcmPlayerLike | null = null;
  private ended = false;
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(private readonly opts: VoiceClientOptions) {}

  on<K extends keyof VoiceClientEvents>(
    ev: K,
    cb: (payload: VoiceClientEvents[K]) => void,
  ): () => void {
    let set = this.listeners.get(ev);
    if (!set) this.listeners.set(ev, (set = new Set()));
    set.add(cb as Listener);
    return () => {
      set.delete(cb as Listener);
    };
  }

  private emit<K extends keyof VoiceClientEvents>(ev: K, payload: VoiceClientEvents[K]): void {
    for (const cb of [...(this.listeners.get(ev) ?? [])]) (cb as (p: unknown) => void)(payload);
  }

  connect(): Promise<void> {
    const { url, token, clinicId, language } = this.opts;
    this.player = (this.opts.playerFactory ?? (() => new PcmPlayer()))();
    this.mic = (this.opts.mediaFactory ?? createMicCapture)();
    const ws = (this.opts.wsFactory ?? ((u: string) => new WebSocket(u) as unknown as SocketLike))(
      url,
    );
    this.ws = ws;
    ws.binaryType = "arraybuffer";

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        this.teardown();
        reject(err);
      };

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "start", token, clinicId, language }));
      };
      ws.onerror = () => fail(new Error("WebSocket error"));
      ws.onclose = (ev) => {
        fail(new Error(`Connection closed before ready (${ev.code})`));
        this.teardown();
        this.emit("close", { code: ev.code, reason: ev.reason });
      };
      ws.onmessage = (ev) => {
        const data = ev.data;
        if (typeof data === "string") {
          const event = parseGatewayEvent(data);
          if (!event) return;
          if (event.type === "flush_playback") this.player?.flush();
          this.emit(event.type, event as never);
          if (event.type === "ready" && !settled) {
            this.startMic().then(
              () => {
                if (settled) return;
                settled = true;
                resolve();
              },
              (e: unknown) => fail(e instanceof Error ? e : new Error(String(e))),
            );
          } else if (event.type === "error") {
            fail(new Error(event.message));
          }
        } else if (data instanceof ArrayBuffer) {
          this.player?.enqueue(data);
          this.emit("audio", data);
        }
      };
    });
  }

  private async startMic(): Promise<void> {
    await this.mic?.start((frame) => {
      if (this.ws && this.ws.readyState === OPEN && !this.ended) this.ws.send(frame);
    });
  }

  end(): void {
    if (this.ended) return;
    const ws = this.ws;
    if (ws && ws.readyState === OPEN) {
      try {
        ws.send(JSON.stringify({ type: "end" }));
      } catch {
        // socket already going away
      }
    }
    this.teardown();
    try {
      ws?.close(1000);
    } catch {
      // ignore
    }
  }

  private teardown(): void {
    this.ended = true;
    this.mic?.stop();
    this.player?.close();
  }
}

export function parseGatewayEvent(raw: string): GatewayEvent | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const r = gatewayEventSchema.safeParse(json);
  return r.success ? (r.data as GatewayEvent) : null;
}
