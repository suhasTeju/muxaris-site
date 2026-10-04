import { clientEventSchema, type ClientEvent, type GatewayEvent } from "@muxaris/shared";
import type { RawData, WebSocket } from "ws";
import type { MediaTransport } from "./session/transport.js";

/** Drop outbound audio rather than buffer without bound for a stalled client. */
/** Cap on frames held while the session is still being set up. */
const MAX_PENDING = 500;
const MAX_PENDING_BYTES = 256 * 1024;
const MAX_BUFFERED_BYTES = 4 * 1024 * 1024;

/** MediaTransport over one WebSocket: binary frames are audio, text frames are ClientEvents. */
export class WsTransport implements MediaTransport {
  private audioCb: ((pcm: Buffer) => void) | undefined;
  private eventCb: ((e: ClientEvent) => void) | undefined;
  private closeCbs: Array<() => void> = [];
  private closedHooks: Array<() => void> = [];
  private closedFired = false;

  /** Frames that arrived before the consumer registered its callback (bounded). */
  private pendingAudio: Buffer[] = [];
  private pendingBytes = 0;
  private pendingEvents: ClientEvent[] = [];

  constructor(private readonly ws: WebSocket) {
    ws.on("message", (data: RawData, isBinary: boolean) => this.feed(data, isBinary));
    ws.on("close", () => this.closeCbs.forEach((cb) => cb()));
  }

  /** Handles one inbound frame; also used to replay frames buffered during session setup. */
  feed(data: RawData, isBinary: boolean): void {
    if (isBinary) {
      const buf = Array.isArray(data)
        ? Buffer.concat(data)
        : data instanceof ArrayBuffer
          ? Buffer.from(data)
          : data;
      if (this.audioCb) this.audioCb(buf);
      else if (
        this.pendingAudio.length < MAX_PENDING &&
        this.pendingBytes + buf.length <= MAX_PENDING_BYTES
      ) {
        this.pendingBytes += buf.length;
        this.pendingAudio.push(buf);
      }
      return;
    }
    let json: unknown;
    try {
      json = JSON.parse(data.toString());
    } catch {
      return;
    }
    const parsed = clientEventSchema.safeParse(json);
    if (!parsed.success) return;
    const ev = parsed.data as ClientEvent;
    if (this.eventCb) this.eventCb(ev);
    else if (this.pendingEvents.length < MAX_PENDING) this.pendingEvents.push(ev);
  }

  onInboundAudio(cb: (pcm16k: Buffer) => void): void {
    this.audioCb = cb;
    const q = this.pendingAudio;
    this.pendingAudio = [];
    this.pendingBytes = 0;
    q.forEach(cb);
  }
  sendAudio(pcm24k: Buffer): void {
    if (this.ws.readyState !== this.ws.OPEN) return;
    if (this.ws.bufferedAmount > MAX_BUFFERED_BYTES) return;
    this.ws.send(pcm24k, { binary: true });
  }
  sendEvent(e: GatewayEvent): void {
    if (this.ws.readyState !== this.ws.OPEN) return;
    this.ws.send(JSON.stringify(e));
  }
  onClientEvent(cb: (e: ClientEvent) => void): void {
    this.eventCb = cb;
    const q = this.pendingEvents;
    this.pendingEvents = [];
    q.forEach(cb);
  }
  onClose(cb: () => void): void {
    this.closeCbs.push(cb);
  }
  /** Runs once when the session closes the transport (after the call row is finished). */
  onceClosed(cb: () => void): void {
    this.closedHooks.push(cb);
  }
  close(): void {
    if (this.ws.readyState === this.ws.OPEN || this.ws.readyState === this.ws.CONNECTING)
      this.ws.close(1000);
    if (this.closedFired) return;
    this.closedFired = true;
    this.closedHooks.forEach((cb) => cb());
  }
}
