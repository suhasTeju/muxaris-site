"use client";

import type { AssistantProfile, Clinic, Role } from "@muxaris/shared";
import { AssistantView } from "@/components/app/assistant/AssistantView";
import type { VoicePreviewFetcher } from "@/components/app/assistant/voice-preview";
import { ApiError } from "@/lib/api";

/** A silent 8 kHz mono WAV of `seconds`, so the preview "plays" without the TTS provider. */
function silentWav(seconds: number): Blob {
  const n = Math.round(8000 * seconds);
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const str = (o: number, s: string) =>
    [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + n, true);
  str(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  str(36, "data");
  v.setUint32(40, n, true);
  new Uint8Array(buf, 44).fill(128);
  return new Blob([buf], { type: "audio/wav" });
}

const FETCHERS: Record<string, VoicePreviewFetcher> = {
  // The design's preview plays for 3.4 s.
  ok: async () => silentWav(3.4),
  unavailable: async () => {
    throw new ApiError(503, "preview_failed", "Voice preview is not available right now.");
  },
  limited: async () => {
    throw new ApiError(429, "preview_failed", "Too many previews. Try again later.");
  },
};

/** Client wrapper so the preview can inject a fixture voice source (functions cannot cross from a server page). */
export function ConfigurePreview({
  clinic,
  role,
  assistant,
  voice,
}: {
  clinic: Clinic;
  role: Role;
  assistant: AssistantProfile | null;
  voice: "ok" | "unavailable" | "limited";
}) {
  return (
    <AssistantView
      clinic={clinic}
      role={role}
      assistant={assistant}
      previewVoice={FETCHERS[voice]}
    />
  );
}
