"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import type { Call } from "@muxaris/shared";
import { Button, Card, Spinner } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useCoreApi } from "./core/api";
import { formatClock } from "./core/format";

const POLL_MS = 5_000;
const POLL_MAX_MS = 120_000;
const BARS = 48;

type Override = "pending" | "unavailable" | null;
type UrlResult = { url: string } | { override: "pending" | "unavailable" } | { failure: string };

/**
 * The design's 48-bar waveform: a fixed shape (the prototype's sin/cos curve, 6–34px tall), teal
 * up to the playback position and grey after it.
 */
export function waveBars(progress: number): Array<{ h: number; played: boolean }> {
  return Array.from({ length: BARS }, (_, i) => ({
    h: 6 + Math.round(Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.27)) * 28),
    played: i / BARS < progress,
  }));
}

function Row({ children, live }: { children: React.ReactNode; live?: boolean }) {
  return (
    <div
      aria-live={live ? "polite" : undefined}
      className="text-muted flex h-[44px] items-center gap-[10px] text-[14px]"
    >
      <Spinner size={16} />
      {children}
    </div>
  );
}

/**
 * Recording card from AppCallDetail.dc.html: play button, waveform you can click to seek, and a
 * mono clock, driving a hidden <audio> element. The presigned URL is fetched on mount (it lives
 * 10 min, so one element error triggers a single re-fetch). While the recording is still being
 * saved the call is polled every 5 s for up to 2 min. "Recording" is only claimed when
 * recordingStatus is ready.
 */
export function CallPlayer({
  callId,
  recordingStatus,
  durationS,
  audioRef,
  onTimeUpdate,
  onCall,
}: {
  callId: string;
  recordingStatus: Call["recordingStatus"];
  /** The call's length, shown until the audio reports its own. */
  durationS?: number | null;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  onTimeUpdate: (ms: number) => void;
  onCall: (call: Call) => void;
}) {
  const api = useCoreApi();
  const [url, setUrl] = useState<string | null>(null);
  const [override, setOverride] = useState<Override>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [mediaDuration, setMediaDuration] = useState<number | null>(null);
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

  // Resolves to what the URL request means for the player; applying it is a separate step so the
  // mount effect only sets state from the promise callback.
  const requestUrl = useCallback(
    (): Promise<UrlResult> =>
      api<{ url: string; expiresInS: number }>(
        `/v1/calls/${encodeURIComponent(callId)}/recording-url`,
      ).then(
        (r): UrlResult => ({ url: r.url }),
        (e: unknown): UrlResult =>
          e instanceof ApiError && e.status === 409
            ? { override: "pending" }
            : e instanceof ApiError && e.status === 404
              ? { override: "unavailable" }
              : { failure: "The recording could not be loaded right now." },
      ),
    [api, callId],
  );
  const apply = useCallback((r: UrlResult) => {
    if ("url" in r) {
      setUrl(r.url);
      setFailure(null);
      setOverride(null);
    } else if ("override" in r) {
      // A Retry that lands on "pending" or "gone" replaces the earlier failure.
      setFailure(null);
      setOverride(r.override);
    } else setFailure(r.failure);
  }, []);
  const fetchUrl = useCallback(() => requestUrl().then(apply), [requestUrl, apply]);

  useEffect(() => {
    if (recordingStatus !== "ready") return;
    let live = true;
    void requestUrl().then((r) => {
      if (live) apply(r);
    });
    return () => {
      live = false;
    };
  }, [recordingStatus, requestUrl, apply]);

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

  const duration = mediaDuration ?? durationS ?? 0;
  const at = (seconds: number) => {
    const clamped = Math.max(0, Math.min(duration || seconds, seconds));
    const audio = audioRef.current;
    if (audio) audio.currentTime = clamped;
    setT(clamped);
    onTimeUpdate(Math.round(clamped * 1000));
  };

  let body: React.ReactNode;
  if (effective === "failed" || effective === "unavailable" || failure) {
    body = (
      <div
        role={failure ? "alert" : undefined}
        className="flex min-h-[44px] items-center justify-between gap-[12px]"
      >
        <span className="flex flex-col">
          <span className="text-[14px] font-semibold">Recording unavailable</span>
          <span className="text-muted text-[13px]">
            The recording could not be loaded right now.
          </span>
        </span>
        {failure ? (
          <Button variant="secondary" size={34} className="text-[14px]" onClick={() => fetchUrl()}>
            Retry
          </Button>
        ) : null}
      </div>
    );
  } else if (effective === "pending") {
    body = <Row live>Recording is being saved…</Row>;
  } else if (!url) {
    body = <Row>Loading recording…</Row>;
  } else {
    const progress = duration ? t / duration : 0;
    body = (
      <div className="flex items-center gap-[14px]">
        <button
          type="button"
          aria-label={playing ? "Pause" : "Play"}
          onClick={() => {
            const audio = audioRef.current;
            if (!audio) return;
            if (playing) audio.pause();
            else void audio.play()?.catch(() => undefined);
          }}
          className="bg-ink hover:bg-ink-hover grid size-[44px] shrink-0 cursor-pointer place-items-center rounded-12 border-0 text-white"
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <div
          role="slider"
          tabIndex={0}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(t)}
          aria-valuetext={`${formatClock(t)} of ${formatClock(duration)}`}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            if (r.width > 0) at(((e.clientX - r.left) / r.width) * duration);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") at(t + 5);
            else if (e.key === "ArrowLeft") at(t - 5);
            else return;
            e.preventDefault();
          }}
          className="flex h-[40px] min-w-0 flex-1 cursor-pointer items-center gap-[1.5px]"
        >
          {waveBars(progress).map((b, i) => (
            <span
              key={i}
              className="min-w-[1.5px] flex-[1_1_0] rounded-[2px]"
              style={{ height: b.h, background: b.played ? "#0e9a96" : "#cfd7e0" }}
            />
          ))}
        </div>
        <span className="text-ink-2 min-w-[84px] shrink-0 text-right font-mono text-[12.5px]">
          {formatClock(t)} / {formatClock(duration)}
        </span>
      </div>
    );
  }

  return (
    <Card aria-label="Call recording" className="flex flex-col gap-[12px] px-[18px] py-[16px]">
      {body}
      {url && effective === "ready" ? (
        <audio
          ref={audioRef}
          preload="none"
          src={url}
          aria-label="Call recording"
          className="hidden"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d) && d > 0) setMediaDuration(d);
            if (resumeAt.current > 0) {
              e.currentTarget.currentTime = resumeAt.current;
              resumeAt.current = 0;
            }
          }}
          onTimeUpdate={(e) => {
            const now = e.currentTarget.currentTime;
            setT(now);
            onTimeUpdate(Math.round(now * 1000));
          }}
          onPlaying={() => {
            retried.current = false;
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
      ) : null}
    </Card>
  );
}
