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
  /** Max wait for the gateway `ready` event. Default 10000 ms. */
  connectTimeoutMs?: number;
}

/** Coarse, stable error category for UI branching (the `message` stays human readable). */
export type VoiceErrorCode = "auth" | "busy" | "quota" | "unsupported" | "network" | "internal";

/** Error thrown by `connect()`; `errorCode` classifies the failure. */
export class VoiceError extends Error {
  constructor(
    message: string,
    readonly errorCode: VoiceErrorCode,
  ) {
    super(message);
    this.name = "VoiceError";
  }
}

export function errorCodeFromGateway(code: string): VoiceErrorCode {
  switch (code) {
    case "auth_failed":
    case "forbidden":
      return "auth";
    case "busy":
      return "busy";
    case "quota":
      return "quota";
    case "not_implemented":
      return "unsupported";
    default:
      return "internal"; // provider, internal
  }
}

export function errorCodeFromClose(code: number): VoiceErrorCode {
  if (code === 4001 || code === 4003) return "auth";
  if (code === 4029) return "busy";
  if (code === 1011) return "internal";
  return "network"; // 1006 abnormal, 1001 going away, ...
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
  private socketClosed = false;
  private gotReady = false;
  private connecting = false;
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
    if (this.ws || this.connecting) return Promise.reject(new Error("already connected"));
    this.connecting = true;
    const { url, token, clinicId, language } = this.opts;
    this.player = (this.opts.playerFactory ?? (() => new PcmPlayer()))();
    this.player.prepare?.();
    this.mic = (this.opts.mediaFactory ?? createMicCapture)();
    return this.open(url, token, clinicId, language);
  }

  private async open(
    url: string,
    token: string,
    clinicId: string,
    language: LanguageCode,
  ): Promise<void> {
    // Ask for the microphone before touching the network, so a pending or denied permission
    // prompt never leaves a half-started call on the gateway.
    try {
      await this.mic?.start((frame) => {
        if (this.gotReady && this.ws && this.ws.readyState === OPEN && !this.ended) {
          this.ws.send(frame);
        }
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.teardown();
      this.emit("error", { type: "error", code: "internal", message });
      throw new VoiceError(message, "unsupported");
    }
    if (this.ended) {
      this.teardown();
      throw new VoiceError("Call ended before it started", "internal");
    }
    const ws = (this.opts.wsFactory ?? ((u: string) => new WebSocket(u) as unknown as SocketLike))(
      url,
    );
    this.ws = ws;
    ws.binaryType = "arraybuffer";

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const settle = (err?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) reject(err);
        else resolve();
      };
      const fail = (err: Error) => {
        settle(err);
        this.shutdown(this.gotReady, 1011);
      };
      const timer = setTimeout(
        () => fail(new VoiceError("Timed out waiting for the gateway", "network")),
        this.opts.connectTimeoutMs ?? 10_000,
      );

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "start", token, clinicId, language }));
      };
      ws.onerror = () => fail(new VoiceError("WebSocket error", "network"));
      ws.onclose = (ev) => {
        this.socketClosed = true;
        this.teardown();
        settle(
          new VoiceError(
            `Connection closed before ready (${ev.code})`,
            errorCodeFromClose(ev.code),
          ),
        );
        this.emit("close", { code: ev.code, reason: ev.reason });
      };
      ws.onmessage = (ev) => {
        const data = ev.data;
        if (typeof data === "string") {
          const event = parseGatewayEvent(data);
          if (!event || this.ended) return;
          if (event.type === "flush_playback") this.player?.flush();
          this.emit(event.type, event as never);
          if (event.type === "ready" && !this.gotReady) {
            this.gotReady = true;
            settle();
          } else if (event.type === "error") {
            settle(new VoiceError(event.message, errorCodeFromGateway(event.code)));
            this.shutdown(false, 1000);
          }
        } else if (data instanceof ArrayBuffer) {
          if (this.ended) return;
          this.player?.enqueue(data);
          this.emit("audio", data);
        }
      };
    });
  }

  /** Ends the call: sends `end`, releases mic/player, closes the socket. Idempotent. */
  end(): void {
    this.shutdown(true, 1000);
  }

  private shutdown(sendEnd: boolean, code: number): void {
    this.teardown();
    const ws = this.ws;
    if (!ws || this.socketClosed) return;
    this.socketClosed = true;
    try {
      if (sendEnd && ws.readyState === OPEN) ws.send(JSON.stringify({ type: "end" }));
      ws.close(code);
    } catch {
      // socket already going away
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
