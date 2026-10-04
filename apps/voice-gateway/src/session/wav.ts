/** WAV helpers for the call recorder: PCM16 little-endian, 16 kHz, interleaved stereo. */

export const WAV_HEADER_BYTES = 44;

/** 44-byte RIFF/WAVE header for PCM16 audio with `dataBytes` of sample data. */
export function wavHeader(
  dataBytes: number,
  opts: { channels?: number; sampleRate?: number } = {},
) {
  const channels = opts.channels ?? 2;
  const sampleRate = opts.sampleRate ?? 16_000;
  const h = Buffer.alloc(WAV_HEADER_BYTES);
  h.write("RIFF", 0, "ascii");
  h.writeUInt32LE(36 + dataBytes, 4);
  h.write("WAVE", 8, "ascii");
  h.write("fmt ", 12, "ascii");
  h.writeUInt32LE(16, 16); // fmt chunk size
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * channels * 2, 28); // byte rate
  h.writeUInt16LE(channels * 2, 32); // block align
  h.writeUInt16LE(16, 34); // bits per sample
  h.write("data", 36, "ascii");
  h.writeUInt32LE(dataBytes, 40);
  return h;
}

/** Interleaves two equal-length PCM16 mono buffers into one stereo buffer (left, right, ...). */
export function interleave(left: Buffer, right: Buffer): Buffer {
  if (left.length !== right.length) throw new Error("channel length mismatch");
  const n = left.length >> 1;
  const out = Buffer.allocUnsafe(n * 4);
  for (let i = 0; i < n; i++) {
    out[i * 4] = left[i * 2]!;
    out[i * 4 + 1] = left[i * 2 + 1]!;
    out[i * 4 + 2] = right[i * 2]!;
    out[i * 4 + 3] = right[i * 2 + 1]!;
  }
  return out;
}
