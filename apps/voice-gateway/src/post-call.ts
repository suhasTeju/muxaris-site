import { createReadStream } from "node:fs";
import { rm } from "node:fs/promises";
import { getCallTranscript, setCallRecording } from "@muxaris/core";
import type { Db } from "@muxaris/db";
import type { PostCallMessage } from "@muxaris/shared";
import { callKeys, type BlobStore, type JobQueue } from "@muxaris/storage";
import type { Recorder } from "./session/recorder.js";
import type { SessionLogger } from "./session/voice-session.js";

/** Everything after the call row is closed: uploads, recording status and the queue message. */
const OVERALL_TIMEOUT_MS = 60_000;

export interface CompleteCallDeps {
  db: Db;
  blobs: BlobStore | null;
  queue: JobQueue<PostCallMessage> | null;
  log: SessionLogger;
}

export interface CompleteCallArgs {
  clinicId: string;
  callId: string;
  recorder: Recorder | null;
  endedAt: Date;
  userTurns: number;
  /** Aborted at shutdown after the grace window: the row is marked failed. */
  signal?: AbortSignal;
}

class CompletionAborted extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "CompletionAborted";
  }
}

const errName = (e: unknown) => (e as { name?: string } | null)?.name ?? "unknown";

/**
 * Uploads the transcript and recording, records the outcome on the call row and enqueues the
 * `call.completed` message. Never throws: failures are logged (ids and error names only) and
 * reflected in `recording_status`.
 */
export async function completeCall(deps: CompleteCallDeps, args: CompleteCallArgs): Promise<void> {
  const { db, blobs, queue, log } = deps;
  const { clinicId, callId, recorder, endedAt, userTurns } = args;
  const ids = { callId, clinicId };

  // Combined deadline: caller's signal (shutdown) or the overall timeout.
  const ac = new AbortController();
  const onExternal = () => ac.abort(new CompletionAborted("shutdown"));
  if (args.signal?.aborted) onExternal();
  else args.signal?.addEventListener("abort", onExternal, { once: true });
  const timer = setTimeout(() => ac.abort(new CompletionAborted("timeout")), OVERALL_TIMEOUT_MS);
  const aborted = new Promise<never>((_, reject) => {
    const fire = () => reject(ac.signal.reason ?? new CompletionAborted("aborted"));
    if (ac.signal.aborted) fire();
    else ac.signal.addEventListener("abort", fire, { once: true });
  });
  aborted.catch(() => undefined);
  const guard = <T>(p: Promise<T>): Promise<T> => Promise.race([p, aborted]);

  let wavPath: string | undefined;
  try {
    if (!blobs) {
      // Nowhere to put anything: leave the row as it is and send no message.
      await recorder?.discard().catch(() => undefined);
      return;
    }
    if (userTurns === 0) {
      await recorder?.discard().catch(() => undefined);
      // Status writes are not guarded: after an abort they are what records the failure.
      await setCallRecording(db, { clinicId, callId, status: "none" }).catch((e) =>
        log.warn("set recording status failed", { ...ids, err: errName(e) }),
      );
      return;
    }

    const transcriptKey = callKeys.transcript(clinicId, callId);
    let status: "ready" | "failed" | "none" = "none";
    let recordingKey: string | undefined;
    let transcriptUploaded = false;
    try {
      const transcript = await guard(getCallTranscript(db, clinicId, callId));
      await guard(
        blobs.put(transcriptKey, Buffer.from(JSON.stringify(transcript)), "application/json"),
      );
      transcriptUploaded = true;
      if (recorder) {
        const r = await guard(recorder.finish());
        if (r) {
          wavPath = r.wavPath;
          const key = callKeys.recording(clinicId, callId);
          await guard(blobs.put(key, createReadStream(r.wavPath), "audio/wav", r.bytes));
          recordingKey = key;
          status = "ready";
          log.info("recording uploaded", { ...ids, bytes: r.bytes, durationMs: r.durationMs });
        }
      }
    } catch (e) {
      status = "failed";
      log.error("post-call upload failed", { ...ids, err: errName(e) });
    }

    try {
      await setCallRecording(db, {
        clinicId,
        callId,
        status,
        ...(recordingKey ? { recordingS3Key: recordingKey } : {}),
        ...(transcriptUploaded ? { transcriptS3Key: transcriptKey } : {}),
      });
    } catch (e) {
      log.error("set recording status failed", { ...ids, err: errName(e) });
    }

    if (queue) {
      try {
        // Not guarded by the abort: a late enqueue is better than losing the analysis job.
        await queue.send({
          type: "call.completed",
          clinicId,
          callId,
          endedAt: endedAt.toISOString(),
          attempt: 1,
        });
      } catch (e) {
        log.error("post-call enqueue failed", { ...ids, err: errName(e) });
      }
    }
  } catch (e) {
    log.error("post-call failed", { ...ids, err: errName(e) });
  } finally {
    clearTimeout(timer);
    args.signal?.removeEventListener("abort", onExternal);
    if (wavPath) await rm(wavPath, { force: true }).catch(() => undefined);
    // Spool files are removed on success by finish(); after a failure or abort do it here.
    await recorder?.discard().catch(() => undefined);
  }
}
