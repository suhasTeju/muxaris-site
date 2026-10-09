"use client";

import Link from "next/link";
import { CircleAlert, Mic, Phone, PhoneOff } from "lucide-react";
import type { LanguageCode } from "@muxaris/shared";
import type { UseVoiceCall } from "@muxaris/voice-sdk";
import { Card, PageHeader, Select, cn } from "@/components/ui";
import { BookingCard } from "../BookingCard";
import { ToolTimeline } from "../ToolTimeline";
import { TranscriptPane } from "../TranscriptPane";
import { AssistantTabs } from "./AssistantTabs";
import {
  callErrorCopy,
  countdownText,
  orbLook,
  statusLabel,
  type StartError,
} from "./call-visuals";

export type CallSnapshot = Pick<
  UseVoiceCall,
  | "phase"
  | "state"
  | "lines"
  | "tools"
  | "booking"
  | "secondsRemaining"
  | "planSecondsRemaining"
  | "error"
  | "errorCode"
>;

export interface TryCallViewProps {
  call: CallSnapshot;
  languages: ReadonlyArray<{ code: LanguageCode; label: string; native: string }>;
  language: LanguageCode;
  onLanguage: (code: LanguageCode) => void;
  /** Fetching a token: Start is disabled. */
  pending: boolean;
  startError: StartError;
  configMessage: string;
  onStart: () => void;
  onStop: () => void;
  tz: string;
}

const NO_MOTION = "motion-reduce:animate-none!";

/** /app/assistant/try: a browser test call, with the live state, transcript and tool calls. */
export function TryCallView({
  call,
  languages,
  language,
  onLanguage,
  pending,
  startError,
  configMessage,
  onStart,
  onStop,
  tz,
}: TryCallViewProps) {
  const { phase, state, lines, tools, booking, error } = call;
  const inCall = phase === "connecting" || phase === "live";
  const look = orbLook(phase, state, error);
  const countdown = countdownText(phase, call.secondsRemaining, call.planSecondsRemaining);
  const err = callErrorCopy({
    startError,
    configMessage,
    phase,
    error,
    errorCode: call.errorCode,
  });
  const idle = phase === "idle" || phase === "error";

  return (
    <div className="animate-mx-in flex flex-col gap-[18px]">
      <div className="flex flex-col gap-[14px]">
        <PageHeader
          title="Try your assistant"
          maxWidth={720}
          subtitle="Talk to your assistant right here in the browser, exactly as a patient would on the phone. Test calls count toward your monthly minutes."
        />
        <AssistantTabs current="try" />
      </div>

      <div className="grid grid-cols-1 items-start gap-[16px] lg:grid-cols-[352px_minmax(0,1fr)]">
        <div className="flex flex-col gap-[12px] lg:sticky lg:top-[84px]">
          <Card
            radius={20}
            aria-label="Test call"
            className="relative flex flex-col gap-[18px] overflow-hidden p-[20px] shadow-[0_1px_2px_rgba(12,18,32,0.04),0_24px_48px_-32px_rgba(12,18,32,0.25)]"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-[220px] transition-[background] duration-[400ms] ease-in-out"
              style={{
                background: `radial-gradient(60% 80% at 50% 0%,${look.glow},transparent 70%)`,
              }}
            />
            <label className="text-ink-2 relative flex flex-col gap-[6px] text-[13px] font-medium">
              Language
              <Select
                size={42}
                value={language}
                disabled={inCall}
                onChange={(e) => onLanguage(e.target.value as LanguageCode)}
              >
                {languages.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label} ({l.native})
                  </option>
                ))}
              </Select>
            </label>

            <div className="relative flex flex-col items-center gap-[14px] pt-[12px] pb-[4px]">
              <div
                aria-hidden="true"
                className="grid size-[132px] place-items-center rounded-full transition-all duration-[350ms] ease-in-out"
                style={{ background: look.orbBackground, boxShadow: look.orbShadow }}
              >
                <div className="flex h-[44px] items-center gap-[4px]">
                  {look.bars.map((b, i) => (
                    <span
                      key={i}
                      data-bar
                      className={cn(
                        "w-[5px] rounded-[3px] transition-[background] duration-300",
                        NO_MOTION,
                      )}
                      style={{ height: b.height, background: b.color, animation: b.animation }}
                    />
                  ))}
                </div>
              </div>
              <div
                role="status"
                aria-live="polite"
                className="flex items-center gap-[8px] text-[14.5px] font-semibold"
              >
                <span
                  aria-hidden="true"
                  className={cn("size-[8px] rounded-full", NO_MOTION)}
                  style={{ background: look.dot.color, animation: look.dot.animation }}
                />
                <span data-testid="state-label">{statusLabel(phase, state, error)}</span>
              </div>
              {countdown ? (
                <span className="text-muted font-mono text-[12.5px]">{countdown}</span>
              ) : null}
            </div>

            <button
              type="button"
              onClick={inCall ? onStop : onStart}
              disabled={!inCall && pending}
              className={cn(
                "relative flex h-[56px] cursor-pointer items-center justify-center gap-[10px] rounded-16 border-0 text-[16px] font-semibold text-white transition-[background] duration-200 disabled:cursor-default disabled:opacity-70",
                inCall
                  ? "bg-[#c22d55] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_14px_28px_-14px_rgba(194,45,85,0.6)]"
                  : "bg-[#0e8a86] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_14px_28px_-14px_rgba(14,138,134,0.6)]",
              )}
            >
              {inCall ? (
                <PhoneOff size={18} aria-hidden="true" />
              ) : (
                <Phone size={18} aria-hidden="true" />
              )}
              {inCall ? "End call" : phase === "ended" ? "Start another call" : "Start call"}
            </button>

            {idle ? (
              <p className="text-muted m-0 flex gap-[8px] text-[12.5px] leading-[1.5]">
                <Mic size={14} aria-hidden="true" className="mt-[2px] shrink-0" />
                Your browser will ask for microphone access when you start. If you block it, you can
                re-enable it from the lock icon in the address bar.
              </p>
            ) : null}
          </Card>

          {err ? (
            <div
              role="alert"
              className="animate-mx-in border-rose-line bg-rose-soft text-rose-deep flex gap-[12px] rounded-14 border px-[16px] py-[14px]"
            >
              <CircleAlert size={17} aria-hidden="true" className="mt-[1px] shrink-0" />
              <div className="flex flex-col gap-[3px]">
                <span className="text-[14px] font-semibold">{err.title}</span>
                <span className="text-[13.5px] leading-[1.5]">{err.body}</span>
                {err.signIn ? (
                  <Link
                    href="/sign-in?next=/app/assistant/try"
                    className="text-rose-deep self-start text-[13.5px] font-semibold underline"
                  >
                    Sign in again
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}

          {booking ? <BookingCard booking={booking} tz={tz} /> : null}
        </div>

        <div className="flex min-w-0 flex-col gap-[14px]">
          <TranscriptPane lines={lines} idle={idle} />
          <ToolTimeline tools={tools} />
        </div>
      </div>
    </div>
  );
}
