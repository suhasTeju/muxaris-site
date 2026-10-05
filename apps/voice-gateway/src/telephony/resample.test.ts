import { describe, expect, it } from "vitest";
import { downsample24kTo8k, upsample8kTo16k } from "./resample.js";

describe("resample", () => {
  it("upsample doubles the length and interpolates", () => {
    const out = upsample8kTo16k(Int16Array.of(0, 100, 200));
    expect(Array.from(out)).toEqual([0, 50, 100, 150, 200, 200]);
  });
  it("downsample averages triples and divides the length by 3", () => {
    expect(Array.from(downsample24kTo8k(Int16Array.of(3, 6, 9, 0, 0, 3)))).toEqual([6, 1]);
    expect(downsample24kTo8k(new Int16Array(480)).length).toBe(160);
  });
  it("drops an incomplete tail", () => {
    expect(downsample24kTo8k(new Int16Array(7)).length).toBe(2);
  });
  it("preserves a DC signal both ways", () => {
    expect(new Set(downsample24kTo8k(new Int16Array(30).fill(1234)))).toEqual(new Set([1234]));
    expect(new Set(upsample8kTo16k(new Int16Array(10).fill(-777)))).toEqual(new Set([-777]));
  });
});
