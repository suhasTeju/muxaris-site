import type { ClientEvent, GatewayEvent } from "@muxaris/shared";
import type { RawData, WebSocket } from "ws";
import type { MediaTransport } from "../session/transport.js";
import { mulawDecode, mulawEncode } from "./mulaw.js";
import { downsample24kTo8k, upsample8kTo16k } from "./resample.js";

/** 20 ms of 8 kHz μ-law. */
const CHUNK_BYTES = 160;
const START_TIMEOUT_MS = 5000;
const MAX_PENDING_BYTES = 256 * 1024;
const MAX_BUFFERED_BYTES = 4 * 1024 * 1024;

export interface TwilioStart {
  callSid: string;
  token: string;
  from?: string;
  to?: string;
}

/** MediaTransport over a Twilio Media Streams WebSocket (JSON frames, base64 μ-law 8 kHz). */
export class TwilioMediaStreamTransport implements MediaTransport {
  private audioCb: ((pcm: Buffer) => void) | undefined;
  private eventCb: ((e: ClientEvent) => void) | undefined;
  private closeCbs: Array<() => void> = [];
  private closedHooks: Array<() => void> = [];
  private closedFired = false;
  private pendingAudio: Buffer[] = [];
  private pendingBytes = 0;
  private pendingEvents: ClientEvent[] = [];
  private streamSid: string | undefined;
  /** Samples/byte left over from the last sendAudio call (keeps 24k -> 8k grouping aligned). */
  private oddByte: number | undefined;
  private carry: number[] = [];
  private started: Promise<TwilioStart>;
  private resolveStarted!: (s: TwilioStart) => void;
  private rejectStarted!: (e: Error) => void;
  private startTimer: ReturnType<typeof setTimeout> | undefined;
  private startSettled = false;

  constructor(
    private readonly ws: WebSocket,
    opts: { startTimeoutMs?: number } = {},
  ) {
    this.started = new Promise<TwilioStart>((res, rej) => {
      this.resolveStarted = res;
      this.rejectStarted = rej;
    });
    this.started.catch(() => undefined); // surfaced only through onceStarted()
    this.startTimer = setTimeout(
      () => this.failStart(new Error("twilio start event not received in time")),
      opts.startTimeoutMs ?? START_TIMEOUT_MS,
    );
    ws.on("message", (data: RawData) => this.feed(data));
    ws.on("close", () => {
      this.failStart(new Error("socket closed before start"));
      this.closeCbs.forEach((cb) => cb());
    });
  }

  private failStart(e: Error): void {
    if (this.startSettled) return;
    this.startSettled = true;
    clearTimeout(this.startTimer);
    this.rejectStarted(e);
  }

  /** Resolves on Twilio's `start` event; rejects after the timeout or if the socket closes first. */
  onceStarted(): Promise<TwilioStart> {
    return this.started;
  }

  private feed(data: RawData): void {
    const raw = Array.isArray(data) ? Buffer.concat(data).toString() : data.toString();
    let msg: unknown;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (typeof msg !== "object" || msg === null) return;
    const m = msg as {
      event?: unknown;
      streamSid?: unknown;
      start?: {
        streamSid?: unknown;
        callSid?: unknown;
        customParameters?: Record<string, unknown>;
      };
      media?: { payload?: unknown };
    };
    switch (m.event) {
      case "start": {
        if (this.startSettled || !m.start) return;
        const sid = m.start.streamSid ?? m.streamSid;
        const p = m.start.customParameters ?? {};
        if (typeof sid !== "string" || typeof m.start.callSid !== "string") return;
        if (typeof p.token !== "string" || !p.token) return;
        this.streamSid = sid;
        this.startSettled = true;
        clearTimeout(this.startTimer);
        this.resolveStarted({
          callSid: m.start.callSid,
          token: p.token,
          ...(typeof p.from === "string" && p.from ? { from: p.from } : {}),
          ...(typeof p.to === "string" && p.to ? { to: p.to } : {}),
        });
        return;
      }
      case "media": {
        if (typeof m.media?.payload !== "string") return;
        const mu = Buffer.from(m.media.payload, "base64");
        const pcm16 = upsample8kTo16k(mulawDecode(mu));
        const buf = Buffer.from(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength);
        if (this.audioCb) this.audioCb(buf);
        else if (this.pendingBytes + buf.length <= MAX_PENDING_BYTES) {
          this.pendingBytes += buf.length;
          this.pendingAudio.push(buf);
        }
        return;
      }
      case "stop": {
        const ev: ClientEvent = { type: "end" };
        if (this.eventCb) this.eventCb(ev);
        else this.pendingEvents.push(ev);
        return;
      }
      default:
        return; // "connected", "mark", "dtmf", unknown
    }
  }

  onInboundAudio(cb: (pcm16k: Buffer) => void): void {
    this.audioCb = cb;
    const q = this.pendingAudio;
    this.pendingAudio = [];
    this.pendingBytes = 0;
    q.forEach(cb);
  }

  sendAudio(pcm24k: Buffer): void {
    if (this.ws.readyState !== this.ws.OPEN || !this.streamSid) return;
    if (this.ws.bufferedAmount > MAX_BUFFERED_BYTES) return;
    let bytes = pcm24k;
    if (this.oddByte !== undefined) bytes = Buffer.concat([Buffer.of(this.oddByte), bytes]);
    this.oddByte = bytes.length % 2 === 1 ? bytes[bytes.length - 1] : undefined;
    const n = Math.floor(bytes.length / 2);
    const samples = new Int16Array(this.carry.length + n);
    this.carry.forEach((v, i) => (samples[i] = v));
    for (let i = 0; i < n; i++) samples[this.carry.length + i] = bytes.readInt16LE(i * 2);
    const whole = samples.length - (samples.length % 3);
    this.carry = Array.from(samples.subarray(whole));
    if (whole === 0) return;
    const mu = mulawEncode(downsample24kTo8k(samples.subarray(0, whole)));
    for (let off = 0; off < mu.length; off += CHUNK_BYTES) {
      const payload = Buffer.from(mu.subarray(off, off + CHUNK_BYTES)).toString("base64");
      this.ws.send(
        JSON.stringify({ event: "media", streamSid: this.streamSid, media: { payload } }),
      );
    }
  }

  sendEvent(e: GatewayEvent): void {
    if (e.type !== "flush_playback") return;
    this.oddByte = undefined;
    this.carry = [];
    if (this.ws.readyState !== this.ws.OPEN || !this.streamSid) return;
    this.ws.send(JSON.stringify({ event: "clear", streamSid: this.streamSid }));
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
    clearTimeout(this.startTimer);
    if (this.ws.readyState === this.ws.OPEN || this.ws.readyState === this.ws.CONNECTING)
      this.ws.close(1000);
    if (this.closedFired) return;
    this.closedFired = true;
    this.closedHooks.forEach((cb) => cb());
  }
}
