import { DevAppFrame } from "@/components/dev/DevAppFrame";
import { clinic } from "@/components/dev/fixtures";
import { AutoClick } from "../_preview/AutoClick";
import { TRY_STATES, type TryState } from "../_preview/fixture-voice";
import { TryPreview } from "../_preview/TryPreview";

/**
 * /dev/assistant/try — Try your assistant, driven by a fixture voice client.
 * ?state=idle (default) · play (press Start for the design's scripted call) · connecting ·
 * connected · listening · thinking · speaking · booked · ended · plan · lost · error-mic ·
 * error-session · error-busy · error-minutes · error-voice · error-start · error-config ·
 * error-network. Every state but idle and play presses Start call on load.
 */
export default async function TryPreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const state: TryState = (TRY_STATES as readonly string[]).includes(q.state ?? "")
    ? (q.state as TryState)
    : "idle";
  return (
    <DevAppFrame plan={state === "plan" ? "pilot" : "standard"}>
      <TryPreview key={state} clinic={clinic} state={state} />
      {state !== "idle" && state !== "play" ? <AutoClick names={["Start call"]} /> : null}
    </DevAppFrame>
  );
}
