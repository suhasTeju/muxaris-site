"use client";

import { useMemo } from "react";
import type { Clinic } from "@muxaris/shared";
import { TryCallSession } from "@/components/app/TryCall";
import { fixtureVoice, type TryState } from "./fixture-voice";

/** Runs the real Try state machine (`useVoiceCall`) against the fixture voice client. */
export function TryPreview({ clinic, state }: { clinic: Clinic; state: TryState }) {
  const voice = useMemo(() => fixtureVoice(state), [state]);
  return <TryCallSession clinicId={clinic.id} clinic={clinic} tz={clinic.timezone} voice={voice} />;
}
