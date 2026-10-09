import type { CallPhase, CallState } from "@muxaris/voice-sdk";
import { CALL_ERROR_COPY, classifyCallError } from "@/lib/call-errors";

export const STATE_LABEL: Record<NonNullable<CallState>, string> = {
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
};

/** The SDK's message when a live call drops without `ended`. */
export const CONNECTION_LOST = "Connection lost";

export function formatRemaining(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function statusLabel(phase: CallPhase, state: CallState, error: string | null): string {
  if (phase === "connecting") return "Connecting…";
  if (phase === "live") return state ? STATE_LABEL[state] : "Connected";
  if (phase === "ended") return "Call ended";
  if (phase === "error" && error === CONNECTION_LOST) return CONNECTION_LOST;
  return "Ready";
}

/** One mono line under the status while live: the plan's minutes when they bind, else the call cap. */
export function countdownText(
  phase: CallPhase,
  secondsRemaining: number | null,
  planSecondsRemaining: number | null,
): string | null {
  if (phase !== "live" || secondsRemaining === null) return null;
  if (planSecondsRemaining !== null) {
    return `Your plan has ${formatRemaining(Math.min(planSecondsRemaining, secondsRemaining))} of call time left this month`;
  }
  return `${formatRemaining(secondsRemaining)} left in this call`;
}

/** Bar heights of the orb's visualiser, from the design. */
const BAR_HEIGHTS = [14, 26, 38, 44, 36, 24, 16];

export interface OrbLook {
  bars: Array<{ height: number; color: string; animation: string }>;
  orbBackground: string;
  orbShadow: string;
  glow: string;
  dot: { color: string; animation: string };
}

/** Colours and motion of the orb, its glow and the status dot for a phase and voice state. */
export function orbLook(phase: CallPhase, state: CallState, error: string | null): OrbLook {
  const inCall = phase === "connecting" || phase === "live";
  const live = phase === "live";
  const speaking = live && state === "speaking";
  const listening = live && state === "listening";
  const thinking = live && state === "thinking";
  return {
    bars: BAR_HEIGHTS.map((h, i) => ({
      height: speaking ? h : listening ? Math.max(8, h * 0.45) : thinking ? 10 : 8,
      color: speaking
        ? "#5ee0d6"
        : listening
          ? "#aeb6c4"
          : thinking
            ? "#f0b44c"
            : inCall
              ? "#5ee0d6"
              : "#3a4558",
      animation: speaking
        ? `mxBar ${0.7 + (i % 3) * 0.15}s ease-in-out ${i * 0.08}s infinite`
        : listening
          ? `mxBar 1.6s ease-in-out ${i * 0.12}s infinite`
          : "none",
    })),
    orbBackground: inCall
      ? "radial-gradient(circle at 50% 35%,#1a2a44,#0c1220)"
      : "radial-gradient(circle at 50% 35%,#1a2438,#0c1220)",
    orbShadow: speaking
      ? "0 0 0 10px rgba(94,224,214,0.12),0 0 0 22px rgba(94,224,214,0.06),0 24px 48px -16px rgba(12,18,32,0.5)"
      : thinking
        ? "0 0 0 10px rgba(240,180,76,0.14),0 24px 48px -16px rgba(12,18,32,0.5)"
        : "0 24px 48px -16px rgba(12,18,32,0.45)",
    glow: speaking
      ? "rgba(94,224,214,0.22)"
      : thinking
        ? "rgba(240,180,76,0.18)"
        : inCall
          ? "rgba(14,154,150,0.12)"
          : "rgba(14,154,150,0.08)",
    dot: speaking
      ? { color: "#16a34a", animation: "mxPulse 1.6s infinite" }
      : thinking
        ? { color: "#d98a14", animation: "mxPulseAmber 1.2s infinite" }
        : listening
          ? { color: "#8a95a5", animation: "none" }
          : phase === "error" && error === CONNECTION_LOST
            ? { color: "#e04870", animation: "none" }
            : { color: inCall ? "#0e9a96" : "#c3ccd7", animation: "none" },
  };
}

/** Problems that stop a call before the voice SDK is involved. */
export type StartError = "config" | "network" | "auth" | null;

export interface CallErrorCopy {
  title: string;
  body: string;
  /** Offer "Sign in again" (expired session). */
  signIn: boolean;
}

/** The error card for a start problem or a failed call, or null when there is none. */
export function callErrorCopy(opts: {
  startError: StartError;
  configMessage: string;
  phase: CallPhase;
  error: string | null;
  errorCode: string | null;
}): CallErrorCopy | null {
  const { startError, configMessage, phase, error, errorCode } = opts;
  if (startError === "config")
    return { title: "Calls are not available", body: configMessage, signIn: false };
  if (startError === "network")
    return {
      title: "Could not reach the sign-in service",
      body: "Check your connection and try again.",
      signIn: false,
    };
  const failure =
    startError === "auth" ? "invalid or expired token" : phase === "error" ? error : null;
  if (failure === null) return null;
  const kind = classifyCallError(failure, startError === "auth" ? null : errorCode);
  return { ...CALL_ERROR_COPY[kind], signIn: kind === "auth_failed" };
}
