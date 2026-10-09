"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BulbulV3Speaker, LanguageCode } from "@muxaris/shared";
import { ApiError, buildRequest } from "@/lib/api";
import { getAccessToken } from "@/lib/api-client";

export interface VoicePreviewRequest {
  clinicId: string;
  text: string;
  language: LanguageCode;
  speaker: BulbulV3Speaker;
}

/** Returns the spoken greeting as audio. Injectable so previews and tests need no network. */
export type VoicePreviewFetcher = (req: VoicePreviewRequest, signal: AbortSignal) => Promise<Blob>;

/** POST /v1/assistant/preview, with the same messages onboarding shows. */
export const fetchVoicePreview: VoicePreviewFetcher = async (req, signal) => {
  const r = buildRequest(
    "/v1/assistant/preview",
    {
      method: "POST",
      clinicId: req.clinicId,
      body: { text: req.text, language: req.language, speaker: req.speaker },
    },
    { token: await getAccessToken() },
  );
  const res = await fetch(r.url, { ...r.init, signal });
  if (!res.ok) {
    throw new ApiError(
      res.status,
      "preview_failed",
      res.status === 503
        ? "Voice preview is not available right now."
        : res.status === 429
          ? "Too many previews. Try again later."
          : "Could not play the preview. Please try again.",
    );
  }
  return res.blob();
};

export type PreviewStatus = "idle" | "loading" | "playing";

/**
 * Plays one greeting at a time. `toggle` starts a preview, or stops the one that is loading or
 * playing; the audio and its object URL are released when it ends, stops or the page unmounts.
 */
export function useVoicePreview(fetcher: VoicePreviewFetcher) {
  const [status, setStatus] = useState<PreviewStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const url = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const release = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    if (audio.current) {
      audio.current.onended = null;
      audio.current.pause();
    }
    audio.current = null;
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
  }, []);
  useEffect(() => release, [release]);

  const stop = useCallback(() => {
    release();
    setStatus("idle");
  }, [release]);

  const toggle = useCallback(
    async (req: VoicePreviewRequest) => {
      if (status !== "idle") return stop();
      const text = req.text.trim().slice(0, 300);
      if (!text) {
        setError("Write a greeting first.");
        return;
      }
      release();
      setError(null);
      setStatus("loading");
      const ctl = new AbortController();
      abort.current = ctl;
      let a: HTMLAudioElement | null = null;
      try {
        const blob = await fetcher({ ...req, text }, ctl.signal);
        if (ctl.signal.aborted) return;
        abort.current = null;
        url.current = URL.createObjectURL(blob);
        a = new Audio(url.current);
        audio.current = a;
        a.onended = () => {
          if (audio.current === a) stop();
        };
        setStatus("playing");
        await a.play();
      } catch (e) {
        // Stopped while loading, or while play() was still pending (it rejects with AbortError).
        if (ctl.signal.aborted || (a && audio.current !== a)) return;
        release();
        setStatus("idle");
        setError(e instanceof ApiError ? e.message : "Could not play the preview.");
      }
    },
    [fetcher, release, status, stop],
  );

  const reset = useCallback(() => {
    stop();
    setError(null);
  }, [stop]);

  return { status, error, toggle, stop, reset };
}
