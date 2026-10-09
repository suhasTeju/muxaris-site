import { DevAppFrame } from "@/components/dev/DevAppFrame";
import { assistantProfile, clinic } from "@/components/dev/fixtures";
import { AutoClick } from "../_preview/AutoClick";
import { ConfigurePreview } from "../_preview/ConfigurePreview";

/** Buttons each `?state=` value presses after load. */
const CLICKS: Record<string, string[]> = {
  // Generating from the template changes the greetings, so the unsaved bar appears.
  dirty: ["Generate from template"],
  playing: ["Preview"],
  "preview-error": ["Preview"],
  kannada: ["ಕನ್ನಡ (Kannada)"],
};

/**
 * /dev/assistant/configure — the Assistant page with the design's seed data.
 * ?role=front_desk · ?state=dirty|playing|preview-error|kannada|empty
 */
export default async function ConfigurePreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const role = q.role === "front_desk" ? "front_desk" : "owner";
  const state = q.state ?? "";
  return (
    <DevAppFrame role={role}>
      <ConfigurePreview
        clinic={clinic}
        role={role}
        assistant={state === "empty" ? null : assistantProfile}
        voice={state === "preview-error" ? "unavailable" : "ok"}
      />
      {CLICKS[state] ? <AutoClick names={CLICKS[state]} /> : null}
    </DevAppFrame>
  );
}
