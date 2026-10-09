import type { GatewayEvent, LanguageCode } from "@muxaris/shared";
import type { MicCapture, PcmPlayerLike, SocketLike } from "@muxaris/voice-sdk";
import { assistantProfile, ist } from "@/components/dev/fixtures";
import type { TryCallVoice } from "@/components/app/TryCall";

/**
 * Development-only fixture voice client for /dev/assistant/try: a fake gateway socket, microphone
 * and player that the real `useVoiceCall` hook drives, so every phase and error of the Try page's
 * state machine can be shown without a WebSocket, a microphone or the voice provider.
 */

/** The prototype's test call (AppTry `CALLER` / `ASSIST`). */
const CALLER = [
  "Hi, I have a bad toothache since last night. Can I see the doctor tomorrow?",
  "Yes please, four thirty works. My name is Ananya.",
];
const ASSIST = [
  "I’m sorry to hear that. Doctor Rao has a slot tomorrow at four thirty in the afternoon. Shall I book it for you?",
  "Done, Ananya. You’re booked at Sunrise Dental Care for tomorrow at four thirty. The clinic will confirm with you.",
];
const CALL_SECONDS = 1200;

type Step =
  | { wait: number }
  | { event: GatewayEvent }
  | { close: number }
  /** Stop here and keep the call as it is (snapshot states). */
  | { hold: true };

const words = (s: string) => s.split(" ").length;
const ev = (event: GatewayEvent): Step => ({ event });
const say = (role: "user" | "assistant", text: string): Step =>
  ev({ type: "transcript", role, text, final: true });
const state = (s: "listening" | "thinking" | "speaking"): Step => ev({ type: "state", state: s });
const tool = (
  name: Extract<GatewayEvent, { type: "tool" }>["name"],
  status: "started" | "done" | "failed",
  summary = "",
): Step => ev({ type: "tool", name, status, summary });

function ready(language: LanguageCode, seconds = CALL_SECONDS, plan?: number): Step {
  return ev({
    type: "ready",
    callId: "call_preview",
    assistantName: assistantProfile.name,
    greeting: assistantProfile.greeting[language] ?? "",
    language,
    secondsRemaining: seconds,
    ...(plan !== undefined ? { planSecondsRemaining: plan } : {}),
  });
}

/** The design's script with its timings (ms per word as the prototype speaks them). */
function script(language: LanguageCode): Step[] {
  const greeting = assistantProfile.greeting[language] ?? "";
  return [
    { wait: 1100 },
    ready(language),
    { wait: 500 },
    state("speaking"),
    { wait: words(greeting) * 120 },
    say("assistant", greeting),
    state("listening"),
    { wait: 800 + words(CALLER[0]!) * 150 },
    say("user", CALLER[0]!),
    state("thinking"),
    tool("find_slots", "started"),
    { wait: 1300 },
    tool("find_slots", "done", "2 slots"),
    state("speaking"),
    { wait: words(ASSIST[0]!) * 110 },
    say("assistant", ASSIST[0]!),
    state("listening"),
    { wait: 700 + words(CALLER[1]!) * 150 },
    say("user", CALLER[1]!),
    state("thinking"),
    tool("lookup_patient", "started"),
    { wait: 650 },
    tool("lookup_patient", "done", "ok"),
    tool("book_appointment", "started"),
    { wait: 1100 },
    tool("book_appointment", "done", "ok"),
    ev({
      type: "booking",
      appointmentId: "a_preview",
      doctorName: "Dr. Meera Rao",
      serviceName: "Consultation",
      startsAt: ist("2026-10-10", "16:30"),
    }),
    state("speaking"),
    { wait: words(ASSIST[1]!) * 110 },
    say("assistant", ASSIST[1]!),
    tool("end_call", "started"),
    { wait: 400 },
    tool("end_call", "done", "ok"),
    ev({ type: "ended", reason: "assistant", outcome: "booked" }),
    { close: 1000 },
  ];
}

/** The first `upTo` events of the script, sent at once, then the call holds where it is. */
function snapshot(language: LanguageCode, upTo: number): Step[] {
  const steps = script(language).filter((s) => !("wait" in s));
  return [
    ...steps.slice(0, upTo),
    ev({ type: "usage", secondsUsed: 12, secondsRemaining: CALL_SECONDS - 12 }),
    { hold: true },
  ];
}

const gatewayError = (code: Extract<GatewayEvent, { type: "error" }>["code"], message: string) =>
  [ev({ type: "error", code, message })] as Step[];

export const TRY_STATES = [
  "idle",
  "connecting",
  "connected",
  "listening",
  "thinking",
  "speaking",
  "booked",
  "ended",
  "plan",
  "lost",
  "error-mic",
  "error-session",
  "error-busy",
  "error-minutes",
  "error-voice",
  "error-start",
  "error-config",
  "error-network",
  "play",
] as const;
export type TryState = (typeof TRY_STATES)[number];

/** Steps the fake gateway runs after the `start` frame, per preview state. */
function stepsFor(s: TryState, language: LanguageCode): Step[] {
  // `snapshot` counts events of the wait-free script: ready, speaking, greeting, listening,
  // caller line, thinking, find_slots started/done, speaking, …
  switch (s) {
    case "connecting":
      return [{ hold: true }];
    case "connected":
      return snapshot(language, 1);
    case "listening":
      return snapshot(language, 4);
    case "thinking":
      return snapshot(language, 7);
    case "speaking":
      return snapshot(language, 9);
    case "booked":
      return snapshot(language, 19);
    case "ended":
      return script(language).filter((x) => !("wait" in x));
    case "plan":
      return [ready(language, 300, 300), state("listening"), { hold: true }];
    case "lost":
      return [...snapshot(language, 4).slice(0, -1), { close: 1006 }];
    case "error-session":
      return gatewayError("auth_failed", "invalid or expired token");
    case "error-busy":
      return [{ close: 4029 }];
    case "error-minutes":
      return gatewayError("quota", "monthly call minutes exhausted");
    case "error-voice":
      return gatewayError("provider", "Voice provider error");
    case "error-start":
      return [{ close: 1006 }];
    default:
      return script(language);
  }
}

class FixtureSocket implements SocketLike {
  binaryType = "arraybuffer";
  readyState = 0;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;
  private timers: Array<ReturnType<typeof setTimeout>> = [];
  private closed = false;

  constructor(private readonly steps: (language: LanguageCode) => Step[]) {
    // VoiceClient attaches its handlers after the factory returns.
    this.later(0, () => {
      this.readyState = 1;
      this.onopen?.({});
    });
  }

  private later(ms: number, fn: () => void) {
    this.timers.push(setTimeout(fn, ms));
  }

  send(data: string | ArrayBuffer | ArrayBufferView): void {
    if (typeof data !== "string") return;
    const msg = JSON.parse(data) as { type: string; language?: LanguageCode };
    if (msg.type !== "start") return;
    let at = 0;
    for (const step of this.steps(msg.language ?? "en-IN")) {
      if ("hold" in step) break;
      if ("wait" in step) {
        at += step.wait;
        continue;
      }
      if ("close" in step) {
        const code = step.close;
        this.later(at, () => this.close(code));
        break;
      }
      const json = JSON.stringify(step.event);
      this.later(at, () => this.onmessage?.({ data: json }));
    }
  }

  close(code = 1000, reason = ""): void {
    if (this.closed) return;
    this.closed = true;
    this.timers.forEach(clearTimeout);
    this.readyState = 3;
    setTimeout(() => this.onclose?.({ code, reason }), 0);
  }
}

const player: () => PcmPlayerLike = () => ({
  enqueue: () => undefined,
  flush: () => undefined,
  close: () => undefined,
});

/** The Try page's voice dependencies for a preview state. */
export function fixtureVoice(s: TryState): TryCallVoice {
  const mic: MicCapture =
    s === "error-mic"
      ? {
          start: async () => {
            throw Object.assign(new Error("Permission denied"), { name: "NotAllowedError" });
          },
          stop: () => undefined,
        }
      : { start: async () => undefined, stop: () => undefined };
  return {
    url: "wss://preview.invalid/v1/session",
    getToken:
      s === "error-network"
        ? async () => {
            throw new Error("offline");
          }
        : async () => "preview-token",
    assertEnv:
      s === "error-config"
        ? () => {
            throw new Error(
              "This deployment is misconfigured: NEXT_PUBLIC_VOICE_WS_URL is not set",
            );
          }
        : () => undefined,
    wsFactory: () => new FixtureSocket((language) => stepsFor(s, language)),
    mediaFactory: () => mic,
    playerFactory: player,
  };
}

/** Every event the fixture gateway can send, for the schema test. */
export function allFixtureEvents(language: LanguageCode): GatewayEvent[] {
  return TRY_STATES.flatMap((s) => stepsFor(s, language))
    .filter((x): x is { event: GatewayEvent } => "event" in x)
    .map((x) => x.event);
}
