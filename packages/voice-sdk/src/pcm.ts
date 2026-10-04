export const TARGET_RATE = 16000;
export const FRAME_BYTES = 3200; // 100 ms of PCM16 mono at 16 kHz

/** Downsample mono float32 audio to 16 kHz (box average for integer ratios, linear interpolation otherwise). */
export function downsampleTo16k(float32: Float32Array, inRate: number): Float32Array {
  if (inRate === TARGET_RATE) return float32;
  if (inRate < TARGET_RATE) throw new Error(`input rate ${inRate} is below ${TARGET_RATE}`);
  const ratio = inRate / TARGET_RATE;
  const outLen = Math.floor(float32.length / ratio);
  const out = new Float32Array(outLen);
  if (Number.isInteger(ratio)) {
    for (let i = 0; i < outLen; i++) {
      let sum = 0;
      const start = i * ratio;
      for (let j = 0; j < ratio; j++) sum += float32[start + j] ?? 0;
      out[i] = sum / ratio;
    }
    return out;
  }
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = float32[idx] ?? 0;
    const b = float32[idx + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
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
