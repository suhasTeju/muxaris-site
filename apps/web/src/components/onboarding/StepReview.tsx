"use client";

import { useEffect, useState } from "react";
import { STEP_LABELS, type OnboardingStep } from "@/lib/onboarding";
import { Btn, ErrorNote, StepShell, errMsg, type Call } from "./ui";

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

  const block = (title: string, step: OnboardingStep, body: React.ReactNode) => (
    <div className="border-line rounded-xl border p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl">{title}</h2>
        <Btn variant="ghost" onClick={() => void onEdit(step)}>
          Edit<span className="sr-only"> {STEP_LABELS[step].toLowerCase()}</span>
        </Btn>
      </div>
      <div className="text-muted mt-1 text-sm">{body}</div>
    </div>
  );

  return (
    <StepShell
      title="Ready to go"
      lead={`Here is what ${clinicName} is set up with.`}
      footer={
        <>
          <Btn variant="ghost" onClick={() => void onBack()}>
            Back
          </Btn>
          <Btn busy={busy} disabled={!sum} onClick={() => void finish()}>
            Finish
          </Btn>
        </>
      }
    >
      {sum ? (
        <>
          {block(
            "Doctors",
            "doctors",
            sum.doctors.length ? sum.doctors.map((d) => d.name).join(", ") : "None yet",
          )}
          {block(
            "Services",
            "services",
            sum.services.length
              ? sum.services
                  .map(
                    (s) =>
                      `${s.name} (${s.durationMin} min${s.priceInr != null ? `, ₹${s.priceInr}` : ""})`,
                  )
                  .join(" · ")
              : "None yet",
          )}
          {block("Assistant", "assistant", sum.assistantName ?? "Not configured yet")}
        </>
      ) : (
        <p className="text-muted text-sm" role="status">
          Loading your setup…
        </p>
      )}
      <ErrorNote message={error} />
    </StepShell>
  );
}
