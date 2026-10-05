import { describe, expect, it } from "vitest";
import { mulawDecode, mulawEncode } from "./mulaw.js";

const all = Uint8Array.from({ length: 256 }, (_, i) => i);

describe("mulaw", () => {
  it("matches canonical G.711 table values", () => {
    const d = mulawDecode(Uint8Array.from([0xff, 0x7f, 0x00, 0x80, 0xcf, 0x4f]));
    expect(Array.from(d)).toEqual([0, 0, -32124, 32124, 924, -924]);
  });
  it("decodes 0xFF to 0", () => {
    expect(mulawDecode(Uint8Array.of(0xff))[0]).toBe(0);
  });
  it("round-trips every code (negative zero 0x7F canonicalises to 0xFF)", () => {
    const back = mulawEncode(mulawDecode(all));
    for (let i = 0; i < 256; i++) expect(back[i]).toBe(i === 0x7f ? 0xff : i);
  });
  it("is monotonic and bounded for a ramp", () => {
    const ramp = Int16Array.from({ length: 64 }, (_, i) => -32768 + i * 1024);
    const dec = mulawDecode(mulawEncode(ramp));
    for (let i = 1; i < dec.length; i++) expect(dec[i]!).toBeGreaterThanOrEqual(dec[i - 1]!);
    expect(Math.abs(dec[32]!)).toBeLessThan(40);
  });
});
