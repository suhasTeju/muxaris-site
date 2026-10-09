"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LANGUAGES, type Clinic, type LanguageCode } from "@muxaris/shared";
import { useVoiceCall, type VoiceClientOptions } from "@muxaris/voice-sdk";
import { useToast } from "@/components/ui";
import { getAccessToken } from "@/lib/api-client";
import { assertRuntimeEnv, env } from "@/lib/env";
import { TryCallView } from "./assistant/TryCallView";
import type { StartError } from "./assistant/call-visuals";
import { useClinic } from "./clinic-context";
import { useClinicProfile } from "./use-clinic-profile";

export { STATE_LABEL, formatRemaining } from "./assistant/call-visuals";

/** Where a test call connects, and the browser pieces it uses. Injectable for previews and tests. */
export interface TryCallVoice extends Pick<
  VoiceClientOptions,
  "wsFactory" | "mediaFactory" | "playerFactory"
> {
  url: string;
  getToken: () => Promise<string | undefined>;
  /** Throws when the deployment cannot place calls (missing configuration). */
  assertEnv: () => void;
}

/** The design's default: Kannada when the clinic offers it, else the clinic's first language. */
export function defaultTryLanguage(codes: readonly LanguageCode[]): LanguageCode {
  return codes.includes("kn-IN") ? "kn-IN" : (codes[0] ?? "en-IN");
}

/** Keyed by clinic so switching clinics mid-call ends the live call instead of orphaning it. */
export function TryCall() {
  const { activeClinic } = useClinic();
  return <TryCallInner key={activeClinic.id} clinicId={activeClinic.id} />;
}

function TryCallInner({ clinicId }: { clinicId: string }) {
  const { clinic, tz } = useClinicProfile();
  const voice = useMemo<TryCallVoice>(
    () => ({
      url: `${env.voiceWsUrl}/v1/session`,
      getToken: getAccessToken,
      assertEnv: assertRuntimeEnv,
    }),
    [],
  );
  return <TryCallSession clinicId={clinicId} clinic={clinic} tz={tz} voice={voice} />;
}

/**
 * The test-call state machine: fetches a fresh token on Start, renders it into the voice hook's
 * options, then starts the call. The token is dropped as soon as the call ends or fails.
 */
export function TryCallSession({
  clinicId,
  clinic,
  tz,
  voice,
}: {
  clinicId: string;
  /** null while the clinic profile loads (English only until then). */
  clinic: Pick<Clinic, "languages"> | null;
  tz: string;
  voice: TryCallVoice;
}) {
  const languages = useMemo(
    () => LANGUAGES.filter((l) => (clinic?.languages ?? ["en-IN"]).includes(l.code)),
    [clinic],
  );
  const [picked, setPicked] = useState<LanguageCode | null>(null);
  const language =
    picked && languages.some((l) => l.code === picked)
      ? picked
      : defaultTryLanguage(languages.map((l) => l.code));
  const [token, setToken] = useState("");
  const [pending, setPending] = useState(false);
  const startingRef = useRef(false);
  const armedRef = useRef(false);
  const [configMessage, setConfigMessage] = useState("");
  const [startError, setStartError] = useState<StartError>(null);

  const call = useVoiceCall({
    url: voice.url,
    token,
    clinicId,
    language,
    ...(voice.wsFactory ? { wsFactory: voice.wsFactory } : {}),
    ...(voice.mediaFactory ? { mediaFactory: voice.mediaFactory } : {}),
    ...(voice.playerFactory ? { playerFactory: voice.playerFactory } : {}),
  });
  const { phase, booking, start, stop } = call;
  const { toast } = useToast();

  // As in the design, a booking made during the test call is also announced with a toast.
  useEffect(() => {
    if (booking)
      toast("Appointment booked by your assistant", {
        action: { label: "View", href: "/app/appointments" },
      });
  }, [booking, toast]);

  // Never keep a token past the call that used it: drop it as the call ends or fails.
  const [seenPhase, setSeenPhase] = useState(phase);
  if (phase !== seenPhase) {
    setSeenPhase(phase);
    if (phase === "ended" || phase === "error") setToken("");
  }

  // Start only after the freshly fetched token has been rendered into the hook's options.
  useEffect(() => {
    if (armedRef.current && token) {
      armedRef.current = false;
      void start();
    }
  }, [token, start]);

  async function onStart() {
    if (startingRef.current) return;
    startingRef.current = true;
    setStartError(null);
    try {
      voice.assertEnv();
    } catch (e) {
      setStartError("config");
      setConfigMessage(e instanceof Error ? e.message : "Misconfigured deployment");
      startingRef.current = false;
      return;
    }
    setPending(true);
    let t: string | undefined;
    try {
      t = await voice.getToken();
    } catch {
      t = undefined;
      setStartError("network");
    }
    startingRef.current = false;
    setPending(false);
    if (t === undefined) {
      setStartError((s) => s ?? "auth");
      return;
    }
    armedRef.current = true;
    setToken(t);
  }

  return (
    <TryCallView
      call={call}
      languages={languages}
      language={language}
      onLanguage={setPicked}
      pending={pending}
      startError={startError}
      configMessage={configMessage}
      onStart={() => void onStart()}
      onStop={stop}
      tz={tz}
    />
  );
}
