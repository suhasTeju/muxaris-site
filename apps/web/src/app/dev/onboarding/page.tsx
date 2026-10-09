import { OnboardingFrame } from "@/components/onboarding/Frame";
import { FIXTURE_EMAIL } from "@/components/dev/fixtures";
import { isStep, type OnboardingStep } from "@/lib/onboarding";
import { WizardPreview } from "./preview";

type Query = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * /dev/onboarding?step=basics|doctors|services|assistant|review
 * &demo=1 (the loaded Sunrise clinic) &state=error|loading|load-error|demo-failed
 */
export default async function Preview({ searchParams }: { searchParams: Query }) {
  const p = await searchParams;
  const raw = first(p["step"]);
  const step: OnboardingStep = isStep(raw) && raw !== "done" ? raw : "basics";
  return (
    <OnboardingFrame email={FIXTURE_EMAIL.owner}>
      <WizardPreview step={step} demo={first(p["demo"]) === "1"} state={first(p["state"])} />
    </OnboardingFrame>
  );
}
