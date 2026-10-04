import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { appendFile, open, rm } from "node:fs/promises";
import { join } from "node:path";
import { interleave, wavHeader } from "./wav.js";

const RATE = 16_000;
const DEFAULT_SPOOL_EVERY_MS = 30_000;
/** Samples per track read at a time while interleaving the final WAV. */
const BLOCK_SAMPLES = 16_384;
const ZERO_BLOCK = Buffer.alloc(64 * 1024);

/**
 * Stateful 24 kHz -> 16 kHz (3:2) decimation with linear interpolation. The fractional read
 * position and the last input sample carry across chunks so chunk boundaries cause no drift.
 */
export class Downsampler {
  /** Position of the next output sample, relative to index 0 of the next chunk (-1 = `last`). */
  private pos = 0;
  private last = 0;

  push(pcm24k: Buffer): Buffer {
    const n = pcm24k.length >> 1;
    if (n === 0) return Buffer.alloc(0);
    const x = (i: number) => (i < 0 ? this.last : pcm24k.readInt16LE(i * 2));
    const out: number[] = [];
    for (;;) {
      const i = Math.floor(this.pos);
      const frac = this.pos - i;
      if (i + (frac > 0 ? 1 : 0) > n - 1) break;
      const v = frac > 0 ? x(i) * (1 - frac) + x(i + 1) * frac : x(i);
      out.push(Math.round(v));
      this.pos += 1.5;
    }
    this.pos -= n;
    this.last = pcm24k.readInt16LE((n - 1) * 2);
    const buf = Buffer.allocUnsafe(out.length * 2);
    out.forEach((v, k) => buf.writeInt16LE(v, k * 2));
    return buf;
  }
}

type Segment = { zeros: number } | { data: Buffer };
const segLen = (s: Segment) => ("data" in s ? s.data.length >> 1 : s.zeros);

/** One mono 16 kHz track: placed chunks, zero-filled gaps, periodic spool to a raw file. */
class Track {
  private pending: Segment[] = [];
  private pendingSamples = 0;
  /** Samples already written to the raw file. */
  spooled = 0;
  /** Samples dropped because the track hit its cap. */
  dropped = 0;
  constructor(
    readonly path: string,
    private readonly maxSamples: number,
  ) {}

  get end(): number {
    return this.spooled + this.pendingSamples;
  }
  get bufferedBytes(): number {
    return this.pendingSamples * 2;
  }

  /** Places a chunk at `index`; a gap is zero-filled, a late (overlapping) chunk appends. */
  place(index: number, pcm: Buffer): void {
    let samples = pcm.length >> 1;
    if (samples === 0) return;
    const end = this.end;
    const start = Math.max(index, end);
    // Hard cap on track length: audio arriving faster than real time cannot grow it unbounded.
    const room = Math.max(0, this.maxSamples - start);
    if (samples > room) {
      this.dropped += samples - room;
      samples = room;
    }
    if (samples === 0) return;
    if (start > end) this.push({ zeros: start - end });
    this.push({ data: Buffer.from(pcm.subarray(0, samples * 2)) });
  }

  private push(s: Segment): void {
    this.pending.push(s);
    this.pendingSamples += segLen(s);
  }

  /** Removes pending samples beyond `keep` (never below what is already spooled). */
  truncate(keep: number): void {
    const target = Math.max(keep, this.spooled);
    let excess = this.end - target;
    while (excess > 0) {
      const s = this.pending[this.pending.length - 1];
      if (!s) break;
      const len = segLen(s);
      if (len <= excess) {
        this.pending.pop();
        this.pendingSamples -= len;
        excess -= len;
      } else {
        if ("data" in s) s.data = s.data.subarray(0, (len - excess) * 2);
        else s.zeros -= excess;
        this.pendingSamples -= excess;
        excess = 0;
      }
    }
  }

  /** Detaches up to `samples` pending samples as buffers ready to write. */
  take(samples: number): Buffer[] {
    const out: Buffer[] = [];
    let left = Math.min(samples, this.pendingSamples);
    while (left > 0 && this.pending.length) {
      const s = this.pending[0]!;
      const len = segLen(s);
      const use = Math.min(len, left);
      if ("data" in s) {
        out.push(s.data.subarray(0, use * 2));
        if (use === len) this.pending.shift();
        else s.data = s.data.subarray(use * 2);
      } else {
        for (let z = use * 2; z > 0; z -= ZERO_BLOCK.length)
          out.push(ZERO_BLOCK.subarray(0, Math.min(z, ZERO_BLOCK.length)));
        if (use === len) this.pending.shift();
        else s.zeros -= use;
      }
      this.pendingSamples -= use;
      this.spooled += use;
      left -= use;
    }
    return out;
  }
}

export interface RecorderOptions {
  sampleRate?: 16000;
  spoolDir: string;
  /** How often completed samples are flushed to disk, default 30 s. */
  spoolEveryMs?: number;
  now?: () => number;
  /** Per-track cap in samples (default: one hour). Excess audio is dropped and counted. */
  maxSamples?: number;
}

export interface RecorderResult {
  wavPath: string;
  durationMs: number;
  bytes: number;
  /** Samples dropped at the per-track cap; non-zero is worth logging. */
  droppedSamples: number;
}

/**
 * Stereo call recorder: caller on the left, assistant on the right, both on one wall-clock
 * timeline at 16 kHz. Audio is spooled to disk so memory stays bounded for long calls.
 */
export class Recorder {
  private readonly now: () => number;
  private readonly spoolEveryMs: number;
  private readonly t0: number;
  private readonly id = randomUUID();
  private readonly wavPath: string;
  private readonly left: Track;
  private readonly right: Track;
  private readonly down = new Downsampler();
  private lastSpoolAt: number;
  private writeChain: Promise<void> = Promise.resolve();
  private writeError: unknown;
  private done = false;
  private discarded = false;

  constructor(opts: RecorderOptions) {
    this.now = opts.now ?? Date.now;
    this.spoolEveryMs = opts.spoolEveryMs ?? DEFAULT_SPOOL_EVERY_MS;
    this.t0 = this.now();
    this.lastSpoolAt = this.t0;
    // Call audio: the spool dir is owner-only and so are the files inside it.
    mkdirSync(opts.spoolDir, { recursive: true, mode: 0o700 });
    chmodSync(opts.spoolDir, 0o700);
    const max = opts.maxSamples ?? RATE * 3600;
    this.left = new Track(join(opts.spoolDir, `${this.id}.L.raw`), max);
    this.right = new Track(join(opts.spoolDir, `${this.id}.R.raw`), max);
    this.wavPath = join(opts.spoolDir, `${this.id}.wav`);
  }

  private nowIndex(): number {
    return Math.max(0, Math.round(((this.now() - this.t0) / 1000) * RATE));
  }

  /** Caller audio: PCM16 mono 16 kHz. */
  caller(pcm16k: Buffer): void {
    if (this.done) return;
    this.left.place(this.nowIndex(), pcm16k);
    this.maybeSpool();
  }

  /** Assistant audio: PCM16 mono 24 kHz, downsampled to 16 kHz. */
  assistant(pcm24k: Buffer): void {
    if (this.done) return;
    this.right.place(this.nowIndex(), this.down.push(pcm24k));
    this.maybeSpool();
  }

  /** Barge-in: drop assistant audio beyond now (the client discarded it on flush_playback). */
  truncateAssistant(): void {
    if (this.done) return;
    this.right.truncate(this.nowIndex());
  }

  /** Samples dropped at the per-track cap (both tracks). */
  get droppedSamples(): number {
    return this.left.dropped + this.right.dropped;
  }

  /** Bytes of audio held in memory (not yet spooled). */
  get bufferedBytes(): number {
    return this.left.bufferedBytes + this.right.bufferedBytes;
  }

  /** Resolves once queued spool writes have completed (tests, shutdown). */
  async settled(): Promise<void> {
    await this.writeChain;
  }

  private maybeSpool(): void {
    const t = this.now();
    if (t - this.lastSpoolAt < this.spoolEveryMs) return;
    this.lastSpoolAt = t;
    const upTo = this.nowIndex();
    for (const track of [this.left, this.right]) this.enqueueWrite(track, upTo - track.spooled);
  }

  private enqueueWrite(track: Track, samples: number): void {
    if (samples <= 0) return;
    const bufs = track.take(samples);
    if (bufs.length === 0) return;
    const data = Buffer.concat(bufs);
    this.writeChain = this.writeChain.then(async () => {
      try {
        await appendFile(track.path, data, { mode: 0o600 });
      } catch (e) {
        this.writeError ??= e;
      }
    });
  }

  /** Writes the stereo WAV and removes the raw spool files; null when nothing was recorded. */
  async finish(): Promise<RecorderResult | null> {
    if (this.done) return null;
    this.done = true;
    const total = Math.max(this.left.end, this.right.end);
    if (total === 0) {
      await this.cleanup();
      return null;
    }
    try {
      for (const track of [this.left, this.right]) {
        const samples = track.end - track.spooled;
        if (samples > 0) this.enqueueWrite(track, samples);
      }
      await this.writeChain;
      if (this.writeError) throw this.writeError;

      if (this.discarded) {
        await this.cleanup();
        return null;
      }
      const bytes = 44 + total * 4;
      const out = await open(this.wavPath, "wx", 0o600);
      const lf = await open(this.left.path, "a+", 0o600);
      const rf = await open(this.right.path, "a+", 0o600);
      try {
        await out.write(wavHeader(total * 4));
        const lb = Buffer.alloc(BLOCK_SAMPLES * 2);
        const rb = Buffer.alloc(BLOCK_SAMPLES * 2);
        for (let at = 0; at < total; at += BLOCK_SAMPLES) {
          const n = Math.min(BLOCK_SAMPLES, total - at);
          lb.fill(0);
          rb.fill(0);
          // A track shorter than the other reads zeros past its end (padding).
          if (at < this.left.end) await lf.read(lb, 0, n * 2, at * 2);
          if (at < this.right.end) await rf.read(rb, 0, n * 2, at * 2);
          await out.write(interleave(lb.subarray(0, n * 2), rb.subarray(0, n * 2)));
        }
      } finally {
        await lf.close().catch(() => undefined);
        await rf.close().catch(() => undefined);
        await out.close().catch(() => undefined);
      }
      if (this.discarded) {
        // discard() raced with us: remove what we just wrote.
        await this.cleanup();
        return null;
      }
      await rm(this.left.path, { force: true });
      await rm(this.right.path, { force: true });
      return {
        wavPath: this.wavPath,
        durationMs: Math.round((total / RATE) * 1000),
        bytes,
        droppedSamples: this.droppedSamples,
      };
    } catch (e) {
      await this.cleanup();
      throw e;
    }
  }

  /** Removes all spool files (call after a failed or unwanted recording). */
  async discard(): Promise<void> {
    this.done = true;
    this.discarded = true;
    await this.cleanup();
  }

  private async cleanup(): Promise<void> {
    await this.writeChain.catch(() => undefined);
    await Promise.all(
      [this.left.path, this.right.path, this.wavPath].map((p) => rm(p, { force: true })),
    );
  }
}
