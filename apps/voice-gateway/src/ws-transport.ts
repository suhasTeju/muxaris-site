import { clientEventSchema, type ClientEvent, type GatewayEvent } from "@muxaris/shared";
import type { RawData, WebSocket } from "ws";
import type { MediaTransport } from "./session/transport.js";

/** Drop outbound audio rather than buffer without bound for a stalled client. */
const MAX_BUFFERED_BYTES = 4 * 1024 * 1024;

/** MediaTransport over one WebSocket: binary frames are audio, text frames are ClientEvents. */
export class WsTransport implements MediaTransport {
  private audioCb: ((pcm: Buffer) => void) | undefined;
  private eventCb: ((e: ClientEvent) => void) | undefined;
  private closeCbs: Array<() => void> = [];
  private closedHooks: Array<() => void> = [];
  private closedFired = false;

  constructor(private readonly ws: WebSocket) {
    ws.on("message", (data: RawData, isBinary: boolean) => {
      if (isBinary) {
        const buf = Array.isArray(data)
          ? Buffer.concat(data)
          : data instanceof ArrayBuffer
            ? Buffer.from(data)
            : data;
        this.audioCb?.(buf);
        return;
      }
      let json: unknown;
      try {
        json = JSON.parse(data.toString());
      } catch {
        return;
      }
      const parsed = clientEventSchema.safeParse(json);
      if (parsed.success) this.eventCb?.(parsed.data as ClientEvent);
    });
    ws.on("close", () => this.closeCbs.forEach((cb) => cb()));
  }

  onInboundAudio(cb: (pcm16k: Buffer) => void): void {
    this.audioCb = cb;
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
