/** Linear 8 kHz -> 16 kHz (output length is twice the input). */
export function upsample8kTo16k(pcm8: Int16Array): Int16Array {
  const out = new Int16Array(pcm8.length * 2);
  for (let i = 0; i < pcm8.length; i++) {
    const a = pcm8[i]!;
    const b = i + 1 < pcm8.length ? pcm8[i + 1]! : a;
    out[2 * i] = a;
    out[2 * i + 1] = Math.round((a + b) / 2);
  }
  return out;
}

/** 24 kHz -> 8 kHz by averaging each complete group of 3 samples (an incomplete tail is dropped). */
export function downsample24kTo8k(pcm24: Int16Array): Int16Array {
  const n = Math.floor(pcm24.length / 3);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++)
    out[i] = Math.round((pcm24[3 * i]! + pcm24[3 * i + 1]! + pcm24[3 * i + 2]!) / 3);
  return out;
}
