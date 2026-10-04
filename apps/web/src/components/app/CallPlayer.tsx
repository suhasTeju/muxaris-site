"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Call } from "@muxaris/shared";
import { ApiError } from "@/lib/api";
import { useApi } from "@/lib/api-client";
import { ghostBtn } from "./Modal";

const POLL_MS = 5_000;
const POLL_MAX_MS = 120_000;

type Override = "pending" | "unavailable" | null;

/**
 * Audio player for the call recording. The presigned URL is fetched on mount (it lives 10 min, so
 * one element error triggers a single re-fetch). While the recording is still being saved the call
 * is polled every 5 s for up to 2 min. "Recording" is only claimed when recordingStatus is ready.
 */
export function CallPlayer({
  callId,
  recordingStatus,
  audioRef,
  onTimeUpdate,
  onCall,
}: {
  callId: string;
  recordingStatus: Call["recordingStatus"];
  audioRef: React.RefObject<HTMLAudioElement | null>;
  onTimeUpdate: (ms: number) => void;
  onCall: (call: Call) => void;
}) {
  const api = useApi();
  const [url, setUrl] = useState<string | null>(null);
  const [override, setOverride] = useState<Override>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const retried = useRef(false);
  const resumeAt = useRef(0);

  // A 409 on a "ready" call means the status changed under us: treat as pending. Anything the call
  // row itself says (failed/none) wins once it arrives.
  const effective: "none" | "pending" | "ready" | "failed" | "unavailable" =
    override === "unavailable"
      ? "unavailable"
      : override === "pending" && recordingStatus === "ready"
        ? "pending"
        : recordingStatus;

  const fetchUrl = useCallback(async (): Promise<void> => {
    setFailure(null);
    try {
      const r = await api<{ url: string; expiresInS: number }>(
        `/v1/calls/${encodeURIComponent(callId)}/recording-url`,
      );
      setUrl(r.url);
      setOverride(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setOverride("pending");
      else if (e instanceof ApiError && e.status === 404) setOverride("unavailable");
      else setFailure("The recording could not be loaded right now.");
    }
  }, [api, callId]);

  useEffect(() => {
    if (recordingStatus !== "ready") return;
    void fetchUrl();
  }, [recordingStatus, fetchUrl]);

  const pending = effective === "pending";
  useEffect(() => {
    if (!pending) return;
    let ticks = 0;
    let live = true;
    const id = setInterval(() => {
      ticks += 1;
      if (ticks * POLL_MS >= POLL_MAX_MS) {
        clearInterval(id);
        setOverride("unavailable");
        return;
      }
      if (recordingStatus === "ready") {
        void fetchUrl();
        return;
      }
      api<{ call: Call }>(`/v1/calls/${encodeURIComponent(callId)}`)
        .then((r) => {
          if (live) onCall(r.call);
        })
        .catch(() => undefined);
    }, POLL_MS);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [pending, recordingStatus, api, callId, fetchUrl, onCall]);

  if (effective === "none") return null;
  if (effective === "failed" || effective === "unavailable") {
    return <p className="text-muted">Recording unavailable</p>;
  }
  if (effective === "pending") {
    return (
      <p aria-live="polite" className="text-muted">
        Recording is being saved…
      </p>
    );
  }
  if (failure) {
    return (
      <p role="alert" className="text-danger flex flex-wrap items-center gap-3 text-sm">
        {failure}
        <button type="button" className={ghostBtn} onClick={() => void fetchUrl()}>
          Retry
        </button>
      </p>
    );
  }
  if (!url) return <p className="text-muted">Loading recording…</p>;

  return (
    <audio
      ref={audioRef}
      controls
      preload="none"
      src={url}
      aria-label="Call recording"
      className="w-full"
      onTimeUpdate={(e) => onTimeUpdate(Math.round(e.currentTarget.currentTime * 1000))}
      onPlaying={() => {
        retried.current = false;
      }}
      onLoadedMetadata={(e) => {
        if (resumeAt.current > 0) {
          e.currentTarget.currentTime = resumeAt.current;
          resumeAt.current = 0;
        }
      }}
      onError={(e) => {
        // The presigned link expires after 10 min: ask for a fresh one once, then give up.
        if (retried.current) {
          setOverride("unavailable");
          return;
        }
        retried.current = true;
        resumeAt.current = e.currentTarget.currentTime;
        void fetchUrl();
      }}
    />
  );
}
