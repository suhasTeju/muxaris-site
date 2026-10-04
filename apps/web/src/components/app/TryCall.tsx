"use client";

import { useEffect, useMemo, useState } from "react";
import { LANGUAGES, type LanguageCode } from "@muxaris/shared";
import { useVoiceCall, type CallState } from "@muxaris/voice-sdk";
import { getAccessToken } from "@/lib/api-client";
import { CALL_ERROR_COPY, classifyCallError } from "@/lib/call-errors";
import { env } from "@/lib/env";
import { BookingCard } from "./BookingCard";
import { useClinic } from "./clinic-context";
import { fieldClass, ghostBtn } from "./Modal";
import { ToolTimeline } from "./ToolTimeline";
import { TranscriptPane } from "./TranscriptPane";
import { useClinicProfile } from "./use-clinic-profile";

export const STATE_LABEL: Record<NonNullable<CallState>, string> = {
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
};

const DOT: Record<NonNullable<CallState>, string> = {
  listening: "bg-muted",
  thinking: "bg-[#d97706] animate-pulse motion-reduce:animate-none",
  speaking: "bg-accent animate-pulse motion-reduce:animate-none",
};

export function formatRemaining(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function TryCall() {
  const { activeClinic } = useClinic();
  const { clinic, tz } = useClinicProfile();
  const languages = useMemo(
    () => LANGUAGES.filter((l) => (clinic?.languages ?? ["en-IN"]).includes(l.code)),
    [clinic],
  );
  const [language, setLanguage] = useState<LanguageCode>("en-IN");
  const [token, setToken] = useState("");
  const [pending, setPending] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    const first = languages[0]?.code;
    if (first && !languages.some((l) => l.code === language)) setLanguage(first);
  }, [languages, language]);

  const call = useVoiceCall({
    url: `${env.voiceWsUrl}/v1/session`,
    token,
    clinicId: activeClinic.id,
    language,
  });
  const { phase, state, lines, tools, booking, secondsRemaining, error, start, stop } = call;

  // Start only after the freshly fetched token has been rendered into the hook's options.
  useEffect(() => {
    if (pending && token) {
      setPending(false);
      void start();
    }
  }, [pending, token, start]);

  // Never keep a token past the call that used it.
  useEffect(() => {
    if (phase === "ended" || phase === "error") setToken("");
  }, [phase]);

  async function onStart() {
    setStartError(null);
    try {
      const t = await getAccessToken();
      if (!t) {
        setStartError("auth");
        return;
      }
      setToken(t);
      setPending(true);
    } catch {
      setStartError("auth");
    }
  }

  const active = phase === "connecting" || phase === "live";
  const failure =
    startError === "auth" ? "invalid or expired token" : phase === "error" ? error : null;
  const errorCopy = failure !== null ? CALL_ERROR_COPY[classifyCallError(failure)] : null;

  return (
    <div className="px-4 py-8 sm:px-8">
      <h1 className="font-display text-3xl">Try your assistant</h1>
      <p className="text-muted mt-1 max-w-xl">
        Talk to your assistant right here in the browser, exactly as a patient would on the phone.
        Test calls count toward your monthly minutes.
      </p>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="flex flex-col gap-5">
          <label className="flex flex-col gap-1 text-sm">
            Language
            <select
              className={fieldClass}
              value={language}
              disabled={active}
              onChange={(e) => setLanguage(e.target.value as LanguageCode)}
            >
              {languages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label} ({l.native})
                </option>
              ))}
            </select>
          </label>

          {active ? (
            <button
              type="button"
              onClick={stop}
              className="bg-danger min-h-14 rounded-2xl px-6 text-lg font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-danger)]"
            >
              End call
            </button>
          ) : (
            <button
              type="button"
              onClick={onStart}
              disabled={pending}
              className="bg-accent text-on-accent hover:bg-accent-deep min-h-14 rounded-2xl px-6 text-lg font-medium transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
            >
              {phase === "ended" || phase === "error" ? "Start another call" : "Start call"}
            </button>
          )}

          <div className="flex items-center justify-between gap-4" aria-live="polite">
            <p className="flex items-center gap-2 text-[15px]">
              <span
                aria-hidden="true"
                className={`inline-block size-3 rounded-full ${state ? DOT[state] : "bg-[color-mix(in_srgb,var(--color-ink)_15%,white)]"}`}
              />
              <span data-testid="state-label">
                {phase === "connecting"
                  ? "Connecting…"
                  : state
                    ? STATE_LABEL[state]
                    : phase === "live"
                      ? "Connected"
                      : phase === "ended"
                        ? "Call ended"
                        : "Ready"}
              </span>
            </p>
            {secondsRemaining !== null && active ? (
              <p className="text-muted text-sm tabular-nums">
                {formatRemaining(secondsRemaining)} remaining
              </p>
            ) : null}
          </div>

          {phase === "idle" && !errorCopy ? (
            <p className="text-muted text-sm">
              Your browser will ask for microphone access when you start. If you block it, you can
              re-enable it from the lock icon in the address bar.
            </p>
          ) : null}

          {errorCopy ? (
            <div role="alert" className="bg-danger-soft text-danger rounded-2xl p-4">
              <p className="font-medium">{errorCopy.title}</p>
              <p className="mt-1 text-sm">{errorCopy.body}</p>
              {classifyCallError(failure) === "auth_failed" && (
                <a href="/sign-in?next=/app/assistant/try" className={`${ghostBtn} mt-3`}>
                  Sign in again
                </a>
              )}
            </div>
          ) : null}

          {booking ? <BookingCard booking={booking} tz={tz} /> : null}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <TranscriptPane lines={lines} live={phase === "live"} />
          <ToolTimeline tools={tools} />
        </div>
      </div>
    </div>
  );
}
