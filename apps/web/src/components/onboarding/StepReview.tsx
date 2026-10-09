"use client";

import { useEffect, useState } from "react";
import { AudioLines, ListChecks, Stethoscope, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui";
import { STEP_LABELS, type OnboardingStep } from "@/lib/onboarding";
import { StepFooter, StepShell, errMsg, type Call } from "./ui";

interface Summary {
  doctors: Array<{ name: string }>;
  services: Array<{ name: string; durationMin: number; priceInr: number | null }>;
  assistantName: string | null;
}

export function StepReview({
  call,
  clinicName,
  onEdit,
  onBack,
  onFinish,
}: {
  call: Call;
  clinicName: string;
  onEdit: (s: OnboardingStep) => Promise<void>;
  onBack: () => Promise<void>;
  onFinish: () => Promise<void>;
}) {
  const [sum, setSum] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([
      call<{ doctors: Summary["doctors"] }>("/v1/doctors"),
      call<{ services: Summary["services"] }>("/v1/services"),
      call<{ assistant: { name?: string } }>("/v1/assistant").catch(() => null),
    ])
      .then(([d, s, a]) => {
        if (live)
          setSum({
            doctors: d.doctors,
            services: s.services,
            assistantName: a?.assistant.name ?? null,
          });
      })
      .catch((e) => live && setError(errMsg(e)));
    return () => {
      live = false;
    };
  }, [call]);

  async function finish() {
    setError(null);
    setBusy(true);
    try {
      await onFinish();
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  }

  const block = (title: string, icon: LucideIcon, step: OnboardingStep, items: string[]) => {
    const Icon = icon;
    return (
      <div className="border-line bg-subtle grid grid-cols-[44px_minmax(0,1fr)_auto] items-start gap-[16px] rounded-16 border p-[18px] max-sm:grid-cols-[44px_minmax(0,1fr)] max-sm:gap-y-[12px]">
        <span className="bg-surface border-line text-teal-ink grid size-[44px] place-items-center rounded-12 border">
          <Icon size={18} aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col gap-[6px]">
          <h2 className="m-0 text-[15.5px] font-semibold">{title}</h2>
          <ul className="m-0 flex list-none flex-wrap gap-[6px] p-0">
            {items.map((it, i) => (
              <li
                key={i}
                className="bg-surface border-line text-ink-2 rounded-8 border px-[10px] py-[4px] text-[13.5px]"
              >
                {it}
              </li>
            ))}
          </ul>
        </div>
        <Button
          variant="secondary"
          size={34}
          onClick={() => void onEdit(step)}
          className="max-sm:col-start-2 max-sm:justify-self-start"
        >
          Edit<span className="sr-only"> {STEP_LABELS[step].toLowerCase()}</span>
        </Button>
      </div>
    );
  };

  return (
    <StepShell
      title="Ready to go"
      lead={`Here is what ${clinicName.trim() || "your clinic"} is set up with.`}
      error={error}
      gap="gap-[12px]"
      footer={
        <StepFooter
          onBack={() => void onBack()}
          busy={busy}
          disabled={!sum}
          label="Finish"
          onNext={() => void finish()}
        />
      }
    >
      {sum ? (
        <>
          {block(
            "Doctors",
            Stethoscope,
            "doctors",
            sum.doctors.length ? sum.doctors.map((d) => d.name) : ["None yet"],
          )}
          {block(
            "Services",
            ListChecks,
            "services",
            sum.services.length
              ? sum.services.map(
                  (s) =>
                    `${s.name} (${s.durationMin} min${s.priceInr != null ? `, ₹${s.priceInr.toLocaleString("en-IN")}` : ""})`,
                )
              : ["None yet"],
          )}
          {block("Assistant", AudioLines, "assistant", [sum.assistantName ?? "Not configured yet"])}
        </>
      ) : (
        <p className="text-muted m-0 text-[14px]" role="status">
          Loading your setup…
        </p>
      )}
    </StepShell>
  );
}
