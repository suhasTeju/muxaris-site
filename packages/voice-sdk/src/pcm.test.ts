import { describe, expect, it } from "vitest";
import { downsampleTo16k, floatToPcm16, FrameChunker } from "./pcm.js";

describe("downsampleTo16k", () => {
  it("passes through 16 kHz", () => {
    const f = new Float32Array([0.1, 0.2]);
    expect(downsampleTo16k(f, 16000)).toBe(f);
  });
  it("averages integer ratios (48k -> 16k)", () => {
    const out = downsampleTo16k(new Float32Array([0, 0.3, 0.6, 1, 1, 1]), 48000);
    expect(out.length).toBe(2);
    expect(out[0]).toBeCloseTo(0.3);
    expect(out[1]).toBeCloseTo(1);
  });
  it("interpolates non-integer ratios (44.1k)", () => {
    const input = new Float32Array(4410).map((_, i) => i / 4410);
    const out = downsampleTo16k(input, 44100);
    expect(out.length).toBe(Math.floor(4410 / 2.75625));
    expect(out[10]).toBeCloseTo((10 * 2.75625) / 4410, 4);
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
