import { pcm16ToFloat } from "./pcm.js";

export const PLAYBACK_RATE = 24000;
/** Jitter buffer for the first chunk after idle/flush; later chunks queue back to back. */
const LEAD_SECONDS = 0.08;

interface SourceLike {
  buffer: unknown;
  onended: (() => void) | null;
  connect(dest: unknown): unknown;
  start(when?: number): void;
  stop(): void;
}
interface BufferLike {
  duration: number;
  copyToChannel(data: Float32Array, channel: number): void;
}
export interface AudioContextLike {
  currentTime: number;
  destination: unknown;
  createBuffer(channels: number, length: number, rate: number): BufferLike;
  createBufferSource(): SourceLike;
  close?(): Promise<void>;
  resume?(): Promise<void> | void;
}

export interface PcmPlayerLike {
  /** Creates and resumes the audio context (call from a user-gesture-initiated path). */
  prepare?(): void;
  enqueue(pcm24k: ArrayBuffer): void;
  flush(): void;
  close(): void;
}

export class PcmPlayer implements PcmPlayerLike {
  private ctx: AudioContextLike | null;
  private nextTime = 0;
  private readonly live = new Set<SourceLike>();

  constructor(private readonly ctxFactory: () => AudioContextLike = defaultCtx) {
    this.ctx = null;
  }

  prepare(): void {
    this.ensure();
  }

  private ensure(): AudioContextLike {
    if (!this.ctx) {
      this.ctx = this.ctxFactory();
      void Promise.resolve(this.ctx.resume?.()).catch(() => undefined);
    }
    return this.ctx;
  }

  enqueue(pcm24k: ArrayBuffer): void {
    const samples = Math.floor(pcm24k.byteLength / 2);
    if (samples === 0) return;
    const ctx = this.ensure();
    const pcm = new Int16Array(pcm24k.slice(0, samples * 2));
    const buffer = ctx.createBuffer(1, samples, PLAYBACK_RATE);
    buffer.copyToChannel(pcm16ToFloat(pcm), 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    const idle = this.nextTime <= ctx.currentTime;
    const startAt = idle ? ctx.currentTime + LEAD_SECONDS : this.nextTime;
    this.nextTime = startAt + buffer.duration;
    this.live.add(source);
    source.onended = () => this.live.delete(source);
    source.start(startAt);
  }

  /** Barge-in: stop everything queued or playing and reset the clock. */
  flush(): void {
    for (const s of this.live) {
      s.onended = null;
      try {
        s.stop();
      } catch {
        // not started / already stopped
      }
    }
    this.live.clear();
    this.nextTime = 0;
  }

  close(): void {
    this.flush();
    const ctx = this.ctx;
    this.ctx = null;
    void ctx?.close?.().catch(() => undefined);
  }
}

function defaultCtx(): AudioContextLike {
  return new AudioContext({ sampleRate: PLAYBACK_RATE }) as unknown as AudioContextLike;
}
