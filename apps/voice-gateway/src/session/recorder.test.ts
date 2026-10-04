import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Downsampler, Recorder } from "./recorder.js";
import { interleave, wavHeader } from "./wav.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "rec-test-"));
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

/** Buffer of n int16 samples with value v. */
function tone(n: number, v: number): Buffer {
  const b = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) b.writeInt16LE(v, i * 2);
  return b;
}

function readWav(path: string) {
  const b = readFileSync(path);
  expect(b.toString("ascii", 0, 4)).toBe("RIFF");
  expect(b.toString("ascii", 8, 12)).toBe("WAVE");
  expect(b.readUInt16LE(22)).toBe(2);
  expect(b.readUInt32LE(24)).toBe(16000);
  const dataBytes = b.readUInt32LE(40);
  expect(b.length).toBe(44 + dataBytes);
  const n = dataBytes / 4;
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i < n; i++) {
    left.push(b.readInt16LE(44 + i * 4));
    right.push(b.readInt16LE(44 + i * 4 + 2));
  }
  return { left, right };
}

describe("wav", () => {
  it("writes a valid 44-byte header for 16 kHz stereo PCM16", () => {
    const h = wavHeader(1000);
    expect(h.length).toBe(44);
    expect(h.toString("ascii", 0, 4)).toBe("RIFF");
    expect(h.readUInt32LE(4)).toBe(36 + 1000);
    expect(h.toString("ascii", 8, 16)).toBe("WAVEfmt ");
    expect(h.readUInt16LE(20)).toBe(1);
    expect(h.readUInt16LE(22)).toBe(2);
    expect(h.readUInt32LE(24)).toBe(16000);
    expect(h.readUInt32LE(28)).toBe(64000);
    expect(h.readUInt16LE(32)).toBe(4);
    expect(h.readUInt16LE(34)).toBe(16);
    expect(h.toString("ascii", 36, 40)).toBe("data");
    expect(h.readUInt32LE(40)).toBe(1000);
  });

  it("interleaves left and right samples", () => {
    const out = interleave(tone(2, 1), tone(2, -2));
    expect([0, 1, 2, 3].map((i) => out.readInt16LE(i * 2))).toEqual([1, -2, 1, -2]);
    expect(() => interleave(tone(1, 1), tone(2, 1))).toThrow();
  });
});

describe("Downsampler", () => {
  it("emits exactly 16000 samples for 1 s of 24 kHz across odd-sized chunks", () => {
    const d = new Downsampler();
    const all = tone(24000, 500);
    const sizes = [1001, 2999, 3, 5000, 7777, 4220, 3000]; // sums to 24000
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(24000);
    let at = 0;
    let total = 0;
    for (const s of sizes) {
      total += d.push(all.subarray(at * 2, (at + s) * 2)).length / 2;
      at += s;
    }
    expect(Math.abs(total - 16000)).toBeLessThanOrEqual(1);
  });

  it("matches a single-shot conversion when chunked arbitrarily", () => {
    const n = 3000;
    const src = Buffer.alloc(n * 2);
    for (let i = 0; i < n; i++) src.writeInt16LE(Math.round(8000 * Math.sin(i / 7)), i * 2);
    const whole = new Downsampler().push(src);
    const d = new Downsampler();
    const parts: Buffer[] = [];
    for (let at = 0, k = 1; at < n; at += k, k = (k * 3) % 11 || 1) {
      parts.push(d.push(src.subarray(at * 2, Math.min(n, at + k) * 2)));
    }
    expect(Buffer.concat(parts).equals(whole)).toBe(true);
  });

  it("interpolates between samples", () => {
    const src = Buffer.alloc(6);
    [0, 100, 200].forEach((v, i) => src.writeInt16LE(v, i * 2));
    const out = new Downsampler().push(src);
    expect([0, 1].map((i) => out.readInt16LE(i * 2))).toEqual([0, 150]);
  });
});

describe("Recorder", () => {
  it("places caller and assistant chunks on one timeline with silence gaps", async () => {
    let t = 0;
    const r = new Recorder({ spoolDir: tmp, now: () => t });
    r.caller(tone(1600, 1000)); // 100 ms at t=0
    t = 500;
    r.assistant(tone(2400 * 3, 2000)); // 300 ms of 24k at t=500 -> 4800 samples at 16k
    t = 1000;
    const out = await r.finish();
    const { left, right } = readWav(out!.wavPath);
    expect(left.length).toBe(right.length);
    expect(left.slice(0, 1600).every((s) => s === 1000)).toBe(true);
    expect(left.slice(1600).every((s) => s === 0)).toBe(true); // gap, then padding
    expect(right.slice(0, 8000).every((s) => s === 0)).toBe(true);
    expect(right.slice(8000, 8000 + 4800).every((s) => s === 2000)).toBe(true);
    expect(out!.durationMs).toBe(800);
    expect(out!.bytes).toBe(statSync(out!.wavPath).size);
    expect(readdirSync(tmp).filter((f) => f.endsWith(".raw"))).toEqual([]);
  });

  it("spools after 30 s and keeps memory bounded", async () => {
    let t = 0;
    const r = new Recorder({ spoolDir: tmp, now: () => t });
    let peak = 0;
    for (; t <= 61_000; t += 20) {
      r.caller(tone(320, 7)); // 20 ms frame
      peak = Math.max(peak, r.bufferedBytes);
    }
    await r.settled();
    const raw = readdirSync(tmp).find((f) => f.endsWith(".L.raw"))!;
    expect(statSync(join(tmp, raw)).size).toBeGreaterThanOrEqual(60 * 16000 * 2);
    expect(peak).toBeLessThan(1_000_000);
    expect(r.bufferedBytes).toBeLessThan(1_000_000);
    t = 61_000;
    const out = await r.finish();
    const { left, right } = readWav(out!.wavPath);
    expect(left.length).toBe(right.length);
    expect(left.length).toBeGreaterThanOrEqual(61 * 16000);
    expect(left.every((s) => s === 7)).toBe(true);
  });

  it("zero-fills a long gap across a spool boundary", async () => {
    let t = 0;
    const r = new Recorder({ spoolDir: tmp, now: () => t, spoolEveryMs: 1000 });
    r.caller(tone(160, 5));
    t = 3000;
    r.caller(tone(160, 6));
    t = 3100;
    const out = await r.finish();
    const { left } = readWav(out!.wavPath);
    expect(left.length).toBe(48000 + 160);
    expect(left.slice(0, 160).every((s) => s === 5)).toBe(true);
    expect(left.slice(160, 48000).every((s) => s === 0)).toBe(true);
    expect(left.slice(48000).every((s) => s === 6)).toBe(true);
  });

  it.skipIf(process.platform === "win32")("keeps the spool dir 0700 and files 0600", async () => {
    let t = 0;
    const dir = join(tmp, "private");
    const r = new Recorder({ spoolDir: dir, now: () => t, spoolEveryMs: 10 });
    r.caller(tone(1600, 1));
    t = 100;
    r.caller(tone(1600, 1));
    await r.settled();
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    const raw = readdirSync(dir).find((f) => f.endsWith(".L.raw"))!;
    expect(statSync(join(dir, raw)).mode & 0o777).toBe(0o600);
    const out = await r.finish();
    expect(statSync(out!.wavPath).mode & 0o777).toBe(0o600);
  });

  it("finish on an empty recorder returns null and leaves no files", async () => {
    const r = new Recorder({ spoolDir: tmp, now: () => 0 });
    expect(await r.finish()).toBeNull();
    expect(readdirSync(tmp)).toEqual([]);
  });

  it("discard removes spool files", async () => {
    let t = 0;
    const r = new Recorder({ spoolDir: tmp, now: () => t, spoolEveryMs: 10 });
    r.caller(tone(1600, 1));
    t = 100;
    r.caller(tone(1600, 1));
    await r.settled();
    expect(readdirSync(tmp).length).toBeGreaterThan(0);
    await r.discard();
    expect(readdirSync(tmp)).toEqual([]);
  });

  it("appends an overlapping late chunk instead of overwriting", async () => {
    let t = 0;
    const r = new Recorder({ spoolDir: tmp, now: () => t });
    r.caller(tone(1600, 1)); // ends at sample 1600
    t = 50; // wall clock says sample 800: overlaps
    r.caller(tone(800, 2));
    t = 200;
    const out = await r.finish();
    const { left } = readWav(out!.wavPath);
    expect(left.length).toBe(2400);
    expect(left.slice(0, 1600).every((s) => s === 1)).toBe(true);
    expect(left.slice(1600).every((s) => s === 2)).toBe(true);
  });

  it("truncateAssistant drops audio pumped ahead of real time", async () => {
    let t = 0;
    const r = new Recorder({ spoolDir: tmp, now: () => t });
    r.assistant(tone(24000 * 2, 2000)); // 2 s of TTS delivered instantly at t=0
    t = 500;
    r.truncateAssistant(); // caller barged in after 500 ms
    t = 1000;
    const out = await r.finish();
    const { right } = readWav(out!.wavPath);
    expect(right.length).toBe(8000);
    expect(right.every((s) => s === 2000)).toBe(true);
  });

  it("audio after a barge-in lands at the wall-clock position", async () => {
    let t = 0;
    const r = new Recorder({ spoolDir: tmp, now: () => t });
    r.assistant(tone(24000 * 2, 2000));
    t = 500;
    r.truncateAssistant();
    t = 1000;
    r.assistant(tone(2400, 3000)); // 100 ms
    const out = await r.finish();
    const { right } = readWav(out!.wavPath);
    expect(right.length).toBe(16000 + 1600);
    expect(right.slice(8000, 16000).every((s) => s === 0)).toBe(true);
    expect(right.slice(16000).every((s) => s === 3000)).toBe(true);
  });
});
