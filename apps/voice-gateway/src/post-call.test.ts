import { mkdtempSync, existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@muxaris/db";
import type { PostCallMessage } from "@muxaris/shared";
import { callKeys } from "@muxaris/storage";
import { FakeBlobStore, FakeQueue } from "@muxaris/storage/fakes";
import { completeCall } from "./post-call.js";
import { Recorder } from "./session/recorder.js";
import { dbReachable, makeDemoClinic, openDb, silentLog, sleep } from "./session/test-helpers.js";

const reachable = await dbReachable();
if (!reachable) console.warn("WARNING: Postgres unreachable, skipping post-call tests");

const { db, pool } = openDb();
let tmp: string;
let clinic: Awaited<ReturnType<typeof makeDemoClinic>>;
beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), "post-call-"));
  if (reachable) clinic = await makeDemoClinic(db, "postcall");
});
afterAll(async () => {
  rmSync(tmp, { recursive: true, force: true });
  if (reachable) await clinic.cleanup();
  await pool.end();
});

function pcm(n: number, v: number): Buffer {
  const b = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) b.writeInt16LE(v, i * 2);
  return b;
}

function recorderWithAudio(): Recorder {
  const r = new Recorder({ spoolDir: tmp });
  r.caller(pcm(1600, 100));
  return r;
}

async function row(callId: string) {
  const [r] = await db.select().from(schema.calls).where(eq(schema.calls.id, callId));
  return r!;
}

class FailingBlobStore extends FakeBlobStore {
  override async put(
    key: string,
    ...rest: Parameters<FakeBlobStore["put"]> extends [string, ...infer R] ? R : never
  ) {
    if (key.endsWith("recording.wav"))
      throw Object.assign(new Error("boom"), { name: "BoomError" });
    return super.put(key, ...rest);
  }
}

describe.skipIf(!reachable)("completeCall", () => {
  const endedAt = new Date("2026-10-04T10:00:00.000Z");

  it("uploads transcript and wav, marks ready, enqueues once", async () => {
    const blobs = new FakeBlobStore();
    const queue = new FakeQueue<PostCallMessage>();
    const callId = await clinic.newCall();
    const recorder = recorderWithAudio();
    await completeCall(
      { db, blobs, queue, log: silentLog },
      { clinicId: clinic.clinicId, callId, recorder, endedAt, userTurns: 2 },
    );
    const wavKey = callKeys.recording(clinic.clinicId, callId);
    const trKey = callKeys.transcript(clinic.clinicId, callId);
    expect(blobs.objects.get(wavKey)?.contentType).toBe("audio/wav");
    expect(blobs.objects.get(wavKey)?.body.subarray(0, 4).toString()).toBe("RIFF");
    expect(blobs.objects.get(trKey)?.contentType).toBe("application/json");
    expect(JSON.parse(blobs.objects.get(trKey)!.body.toString()).callId).toBe(callId);
    const r = await row(callId);
    expect(r.recordingStatus).toBe("ready");
    expect(r.recordingS3Key).toBe(wavKey);
    expect(r.transcriptS3Key).toBe(trKey);
    expect(queue.sent).toEqual([
      {
        type: "call.completed",
        clinicId: clinic.clinicId,
        callId,
        endedAt: endedAt.toISOString(),
        attempt: 1,
      },
    ]);
  });

  it("abandoned call records nothing", async () => {
    const blobs = new FakeBlobStore();
    const queue = new FakeQueue<PostCallMessage>();
    const callId = await clinic.newCall();
    const recorder = recorderWithAudio();
    await completeCall(
      { db, blobs, queue, log: silentLog },
      { clinicId: clinic.clinicId, callId, recorder, endedAt, userTurns: 0 },
    );
    expect(blobs.objects.size).toBe(0);
    expect(queue.sent).toEqual([]);
    expect((await row(callId)).recordingStatus).toBe("none");
  });

  it("upload failure marks failed, keeps the transcript key and still enqueues", async () => {
    const blobs = new FailingBlobStore();
    const queue = new FakeQueue<PostCallMessage>();
    const callId = await clinic.newCall();
    await completeCall(
      { db, blobs, queue, log: silentLog },
      { clinicId: clinic.clinicId, callId, recorder: recorderWithAudio(), endedAt, userTurns: 1 },
    );
    const r = await row(callId);
    expect(r.recordingStatus).toBe("failed");
    expect(r.transcriptS3Key).toBe(callKeys.transcript(clinic.clinicId, callId));
    expect(r.recordingS3Key).toBeNull();
    expect(queue.sent).toHaveLength(1);
  });

  it("recordCalls false (no recorder): transcript yes, wav no", async () => {
    const blobs = new FakeBlobStore();
    const queue = new FakeQueue<PostCallMessage>();
    const callId = await clinic.newCall();
    await completeCall(
      { db, blobs, queue, log: silentLog },
      { clinicId: clinic.clinicId, callId, recorder: null, endedAt, userTurns: 1 },
    );
    expect([...blobs.objects.keys()]).toEqual([callKeys.transcript(clinic.clinicId, callId)]);
    const r = await row(callId);
    expect(r.recordingStatus).toBe("none");
    expect(r.transcriptS3Key).toBe(callKeys.transcript(clinic.clinicId, callId));
    expect(queue.sent).toHaveLength(1);
  });

  it("empty recorder: status none with transcript key", async () => {
    const blobs = new FakeBlobStore();
    const callId = await clinic.newCall();
    await completeCall(
      { db, blobs, queue: null, log: silentLog },
      {
        clinicId: clinic.clinicId,
        callId,
        recorder: new Recorder({ spoolDir: tmp }),
        endedAt,
        userTurns: 1,
      },
    );
    const r = await row(callId);
    expect(r.recordingStatus).toBe("none");
    expect(r.transcriptS3Key).not.toBeNull();
    expect(blobs.objects.size).toBe(1);
  });

  it("no blob store: nothing uploaded, row untouched, no queue message", async () => {
    const queue = new FakeQueue<PostCallMessage>();
    const callId = await clinic.newCall();
    await completeCall(
      { db, blobs: null, queue, log: silentLog },
      { clinicId: clinic.clinicId, callId, recorder: null, endedAt, userTurns: 3 },
    );
    expect(queue.sent).toEqual([]);
    expect((await row(callId)).recordingStatus).toBe("none");
  });

  it("removes the wav spool file after upload", async () => {
    const blobs = new FakeBlobStore();
    const callId = await clinic.newCall();
    const dir = mkdtempSync(join(tmpdir(), "post-call-spool-"));
    const recorder = new Recorder({ spoolDir: dir });
    recorder.caller(pcm(1600, 1));
    await completeCall(
      { db, blobs, queue: null, log: silentLog },
      { clinicId: clinic.clinicId, callId, recorder, endedAt, userTurns: 1 },
    );
    const { readdirSync } = await import("node:fs");
    expect(readdirSync(dir)).toEqual([]);
    expect(existsSync(dir)).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("abort during finish() leaves no wav behind and destroys the upload", async () => {
    const dir = mkdtempSync(join(tmpdir(), "post-call-abort-"));
    try {
      const recorder = new Recorder({ spoolDir: dir });
      recorder.caller(pcm(16000 * 20, 1));
      const callId = await clinic.newCall();
      const ac = new AbortController();
      ac.abort();
      await completeCall(
        { db, blobs: new FakeBlobStore(), queue: null, log: silentLog },
        { clinicId: clinic.clinicId, callId, recorder, endedAt, userTurns: 1, signal: ac.signal },
      );
      await sleep(200); // finish() may still be running in the background
      expect(readdirSync(dir)).toEqual([]);
      expect((await row(callId)).recordingStatus).toBe("failed");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("aborted completion marks the row failed and never throws", async () => {
    class SlowBlobStore extends FakeBlobStore {
      override async put(): Promise<void> {
        await new Promise(() => undefined); // never settles
      }
    }
    const queue = new FakeQueue<PostCallMessage>();
    const callId = await clinic.newCall();
    const ac = new AbortController();
    const p = completeCall(
      { db, blobs: new SlowBlobStore(), queue, log: silentLog },
      {
        clinicId: clinic.clinicId,
        callId,
        recorder: recorderWithAudio(),
        endedAt,
        userTurns: 1,
        signal: ac.signal,
      },
    );
    setTimeout(() => ac.abort(), 50);
    await p;
    expect((await row(callId)).recordingStatus).toBe("failed");
  });
});
