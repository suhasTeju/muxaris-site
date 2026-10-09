"use client";

import { Check, Save } from "lucide-react";
import { MonoLabel, cn } from "@/components/ui";
import { STEP_LABELS, WIZARD_STEPS, type OnboardingStep } from "@/lib/onboarding";

/**
 * The left rail: "Step N of 5", the teal bar, and the five steps. Steps already reached are
 * buttons back to that step; later ones are disabled. `step` null renders the loading rail.
 */
export function Progress({
  step,
  maxStep = 0,
  onGo,
}: {
  step: OnboardingStep | null;
  /** Index of the furthest step reached. */
  maxStep?: number;
  onGo?: (step: OnboardingStep) => void;
}) {
  const current = step ? Math.max(0, WIZARD_STEPS.indexOf(step)) : -1;
  const total = WIZARD_STEPS.length;
  const pct = current < 0 ? 0 : ((current + 1) / total) * 100;
  return (
    <aside
      aria-label="Onboarding progress"
      className="flex min-w-0 flex-col gap-[24px] lg:sticky lg:top-[104px]"
    >
      <div className="flex flex-col gap-[6px]">
        <MonoLabel className={current < 0 ? "invisible" : undefined}>
          Step {current + 1} of {total}
        </MonoLabel>
        <div className="bg-line h-[4px] overflow-hidden rounded-[4px]">
          <div
            className="bg-teal h-[4px] rounded-[4px] transition-[width] duration-300 ease-in-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <ol className="m-0 flex list-none flex-col gap-[4px] p-0 max-lg:flex-row max-lg:overflow-x-auto">
        {WIZARD_STEPS.map((s, i) => {
          const cur = i === current;
          const done = !cur && current >= 0 && (i < current || i < maxStep);
          const reachable = current >= 0 && i <= Math.max(maxStep, current);
          return (
            <li key={s} className="max-lg:flex-none">
              <button
                type="button"
                disabled={!reachable}
                aria-current={cur ? "step" : undefined}
                onClick={() => {
                  if (!cur && reachable) onGo?.(s);
                }}
                className={cn(
                  "flex w-full items-center gap-[12px] rounded-12 border px-[12px] py-[10px] text-left transition-all duration-200 max-lg:w-auto max-lg:whitespace-nowrap",
                  cur ? "border-line bg-surface" : "border-transparent bg-transparent",
                  reachable ? "cursor-pointer" : "cursor-default",
                )}
              >
                <span
                  className={cn(
                    "grid size-[26px] flex-none place-items-center rounded-8 border font-mono text-[12px]",
                    cur
                      ? "bg-ink border-ink text-white"
                      : done
                        ? "bg-teal-soft border-teal-line text-teal-ink"
                        : "bg-surface border-line text-muted-2",
                  )}
                >
                  {done ? <Check size={13} aria-hidden="true" /> : i + 1}
                </span>
                <span
                  className={cn(
                    "text-[14.5px]",
                    cur
                      ? "text-ink font-semibold"
                      : done
                        ? "text-ink font-medium"
                        : "text-muted font-medium",
                  )}
                >
                  {STEP_LABELS[s]}
                  {done ? <span className="sr-only"> (completed)</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="text-muted m-0 flex gap-[8px] text-[13px] leading-[1.5]">
        <Save size={14} aria-hidden="true" className="mt-[2px] flex-none" />
        Progress is saved after every step, so you can leave and resume.
      </p>
    </aside>
  );
}
