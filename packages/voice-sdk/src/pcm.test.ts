import { describe, expect, it } from "vitest";
import { downsampleTo16k, floatToPcm16, FrameChunker, Resampler } from "./pcm.js";

function stream(inRate: number, fn: (t: number) => number, block = 128): Float32Array[] {
  const out: Float32Array[] = [];
  const r = new Resampler(inRate);
  for (let i = 0; i < inRate; i += block) {
    const n = Math.min(block, inRate - i);
    out.push(r.push(new Float32Array(n).map((_, k) => fn((i + k) / inRate))));
  }
  return out;
}
const concat = (parts: Float32Array[]) => {
  const o = new Float32Array(parts.reduce((a, p) => a + p.length, 0));
  let off = 0;
  for (const p of parts) {
    o.set(p, off);
    off += p.length;
  }
  return o;
};

describe("Resampler", () => {
  it("passes through 16 kHz", () => {
    const f = new Float32Array([0.1, 0.2]);
    expect(downsampleTo16k(f, 16000)).toBe(f);
  });
  it.each([48000, 44100])("yields 16000 samples per second from %i in 128 blocks", (rate) => {
    const total = concat(stream(rate, () => 0.5)).length;
    expect(Math.abs(total - 16000)).toBeLessThanOrEqual(1);
  });
  it.each([48000, 44100])("preserves a 1 kHz sine at %i", (rate) => {
    const out = concat(stream(rate, (t) => Math.sin(2 * Math.PI * 1000 * t)));
    // 2-tap filter delays the input by half an input sample
    const delay = rate > 24000 ? 0.5 / rate : 0;
    let maxErr = 0;
    for (let k = 20; k < out.length - 20; k++) {
      const expected = Math.sin(2 * Math.PI * 1000 * (k / 16000 - delay));
      maxErr = Math.max(maxErr, Math.abs((out[k] ?? 0) - expected));
    }
    expect(maxErr).toBeLessThan(0.05);
  });
  it("is independent of block size", () => {
    const fn = (t: number) => Math.sin(2 * Math.PI * 300 * t);
    const a = concat(stream(48000, fn, 128));
    const b = concat(stream(48000, fn, 1000));
    for (let i = 0; i < Math.min(a.length, b.length) - 2; i++)
      expect(a[i]).toBeCloseTo(b[i] ?? NaN, 5);
  });
  it("throws at construction below 16 kHz", () => {
    expect(() => new Resampler(8000)).toThrow();
  });
});

describe("floatToPcm16", () => {
  it("clamps and scales", () => {
    const out = floatToPcm16(new Float32Array([0, 1, -1, 2, -2, 0.5]));
    expect(Array.from(out)).toEqual([0, 32767, -32768, 32767, -32768, 16384]);
  });
});

describe("FrameChunker", () => {
  it("emits exact 3200-byte frames across pushes", () => {
    const c = new FrameChunker(3200);
    expect(c.push(new Int16Array(1000))).toHaveLength(0);
    const frames = c.push(new Int16Array(2300)); // 3300 samples = 6600 bytes
    expect(frames).toHaveLength(2);
    expect(frames.every((f) => f.byteLength === 3200)).toBe(true);
    expect(c.push(new Int16Array(1500))).toHaveLength(1); // 200 + 3000 bytes -> third frame
  });
  it("preserves sample order", () => {
    const c = new FrameChunker(4);
    const frames = c.push(new Int16Array([1, 2, 3]));
    expect(Array.from(new Int16Array(frames[0]!))).toEqual([1, 2]);
    expect(Array.from(new Int16Array(c.push(new Int16Array([4]))[0]!))).toEqual([3, 4]);
  });
});
