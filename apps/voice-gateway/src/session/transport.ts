import type { ClientEvent, GatewayEvent } from "@muxaris/shared";

/** Bidirectional media + control channel for one call (a WebSocket in production). */
export interface MediaTransport {
  /** PCM16 mono 16 kHz from the caller. */
  onInboundAudio(cb: (pcm16k: Buffer) => void): void;
  /** PCM16 mono 24 kHz to the caller. */
  sendAudio(pcm24k: Buffer): void;
  sendEvent(e: GatewayEvent): void;
  onClientEvent(cb: (e: ClientEvent) => void): void;
  onClose(cb: () => void): void;
  close(): void;
}
