/** G.711 μ-law <-> 16-bit linear PCM. */

const BIAS = 0x84;
const CLIP = 32635;

const DECODE_TABLE: Int16Array = (() => {
  const t = new Int16Array(256);
  for (let code = 0; code < 256; code++) {
    const u = ~code & 0xff;
    const exp = (u >> 4) & 7;
    const mant = u & 0x0f;
    const mag = (((mant << 3) + BIAS) << exp) - BIAS;
    t[code] = u & 0x80 ? -mag : mag;
  }
  return t;
})();

export function mulawDecode(u8: Uint8Array): Int16Array {
  const out = new Int16Array(u8.length);
  for (let i = 0; i < u8.length; i++) out[i] = DECODE_TABLE[u8[i]!]!;
  return out;
}

function encodeSample(sample: number): number {
  const sign = sample < 0 ? 0x80 : 0;
  const mag = Math.min(Math.abs(sample), CLIP) + BIAS;
  let exp = 7;
  for (let mask = 0x4000; (mag & mask) === 0 && exp > 0; mask >>= 1) exp--;
  const mant = (mag >> (exp + 3)) & 0x0f;
  return ~(sign | (exp << 4) | mant) & 0xff;
}

export function mulawEncode(pcm: Int16Array): Uint8Array {
  const out = new Uint8Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = encodeSample(pcm[i]!);
  return out;
}
