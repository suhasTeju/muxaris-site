import { STEP_LABELS, WIZARD_STEPS, type OnboardingStep } from "@/lib/onboarding";

export function Progress({ step }: { step: OnboardingStep }) {
  const current = Math.max(0, WIZARD_STEPS.indexOf(step));
  return (
    <nav aria-label="Onboarding progress" className="mb-8">
      <p className="text-muted mb-3 text-sm sm:hidden">
        Step {current + 1} of {WIZARD_STEPS.length}: {STEP_LABELS[WIZARD_STEPS[current]!]}
      </p>
      <ol className="flex items-center gap-2">
        {WIZARD_STEPS.map((s, i) => {
          const state = i < current ? "done" : i === current ? "current" : "todo";
          return (
            <li
              key={s}
              className="flex flex-1 flex-col gap-2"
              aria-current={state === "current" ? "step" : undefined}
            >
              <span
                className={`h-1.5 rounded-full ${state === "todo" ? "bg-line" : "bg-accent"}`}
                aria-hidden="true"
              />
              <span
                className={`hidden text-sm sm:block ${state === "current" ? "text-ink font-medium" : "text-muted"}`}
              >
                {i + 1}. {STEP_LABELS[s]}
                {state === "done" ? <span className="sr-only"> (completed)</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
