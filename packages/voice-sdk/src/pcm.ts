export const TARGET_RATE = 16000;
export const FRAME_BYTES = 3200; // 100 ms of PCM16 mono at 16 kHz

/**
 * Stateful streaming resampler (to 16 kHz by default). Keeps the fractional read position and the
 * unconsumed input tail across `push` calls, so arbitrary block sizes (e.g. 128-sample worklet
 * quanta) produce a continuous, correctly-timed stream. Linear interpolation, with a cheap 2-tap
 * box average as anti-alias filter when downsampling by more than 1.5x.
 */
export class Resampler {
  private readonly ratio: number;
  private readonly filter: boolean;
  private buf = new Float32Array(0);
  private pos = 0;
  private prev = 0;

  constructor(inRate: number, outRate: number = TARGET_RATE) {
    if (!(inRate >= outRate)) throw new Error(`input rate ${inRate} is below ${outRate}`);
    this.ratio = inRate / outRate;
    this.filter = this.ratio > 1.5;
  }

  push(input: Float32Array): Float32Array {
    if (this.ratio === 1) return input;
    let src = input;
    if (this.filter) {
      src = new Float32Array(input.length);
      let prev = this.prev;
      for (let i = 0; i < input.length; i++) {
        const x = input[i] ?? 0;
        src[i] = (x + prev) / 2;
        prev = x;
      }
      this.prev = prev;
    }
    const all = new Float32Array(this.buf.length + src.length);
    all.set(this.buf);
    all.set(src, this.buf.length);

    const out: number[] = [];
    let pos = this.pos;
    while (Math.floor(pos) + 1 < all.length) {
      const idx = Math.floor(pos);
      const frac = pos - idx;
      const a = all[idx] ?? 0;
      const b = all[idx + 1] ?? a;
      out.push(a + (b - a) * frac);
      pos += this.ratio;
    }
    const drop = Math.min(Math.floor(pos), all.length);
    this.buf = all.slice(drop);
    this.pos = pos - drop;
    return Float32Array.from(out);
  }
}

/** Single-shot downsample to 16 kHz. For streams use `Resampler`. */
export function downsampleTo16k(float32: Float32Array, inRate: number): Float32Array {
  return new Resampler(inRate, TARGET_RATE).push(float32);
}

export function floatToPcm16(f: Float32Array): Int16Array {
  const out = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) {
    const s = Math.max(-1, Math.min(1, f[i] ?? 0));
    out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
  }
  return out;
}

export function pcm16ToFloat(pcm: Int16Array): Float32Array {
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = (pcm[i] ?? 0) / 0x8000;
  return out;
}

/** Buffers Int16 samples and emits exact fixed-size byte frames. */
export class FrameChunker {
  private buf: Uint8Array;
  private filled = 0;

  constructor(private readonly frameBytes: number = FRAME_BYTES) {
    this.buf = new Uint8Array(frameBytes);
  }

  push(samples: Int16Array): ArrayBuffer[] {
    const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
    const frames: ArrayBuffer[] = [];
    let offset = 0;
    while (offset < bytes.length) {
      const n = Math.min(this.frameBytes - this.filled, bytes.length - offset);
      this.buf.set(bytes.subarray(offset, offset + n), this.filled);
      this.filled += n;
      offset += n;
      if (this.filled === this.frameBytes) {
        frames.push(this.buf.slice().buffer);
        this.filled = 0;
      }
    }
    return frames;
  }

  reset(): void {
    this.filled = 0;
  }
}
