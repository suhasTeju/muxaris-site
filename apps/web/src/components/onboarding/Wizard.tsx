"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LANGUAGE_CODES, type LanguageCode } from "@muxaris/shared";
import type { ApiInit } from "@/lib/api";
import { useApi } from "@/lib/api-client";
import {
  nextStep,
  prevStep,
  resumeStep,
  writeActiveClinicCookie,
  type OnboardingStep,
} from "@/lib/onboarding";
import { Progress } from "./Progress";
import { StepAssistant } from "./StepAssistant";
import { StepBasics, SUNRISE_BASICS, type ClinicInfo } from "./StepBasics";
import { StepDoctors } from "./StepDoctors";
import { StepReview } from "./StepReview";
import { StepServices } from "./StepServices";
import { ErrorNote, errMsg } from "./ui";

interface ClinicRow {
  id: string;
  name: string;
  city?: string | null;
  phone?: string | null;
  languages?: string[] | null;
}

const toInfo = (c: ClinicRow): ClinicInfo => ({
  id: c.id,
  name: c.name,
  city: c.city ?? null,
  phone: c.phone ?? null,
  languages: (c.languages ?? []).filter((l): l is LanguageCode =>
    (LANGUAGE_CODES as readonly string[]).includes(l),
  ),
});

export function Wizard({
  initialClinic,
  cookieStale,
}: {
  initialClinic: { id: string; name: string } | null;
  cookieStale: boolean;
}) {
  const router = useRouter();
  const api = useApi();
  const [clinic, setClinic] = useState<ClinicInfo | null>(
    initialClinic ? { ...initialClinic, languages: [] } : null,
  );
  const [step, setStep] = useState<OnboardingStep | null>(initialClinic ? null : "basics");
  const [loadError, setLoadError] = useState<string | null>(null);
  const clinicId = clinic?.id;
  const resumed = useRef(false);

  const callFor = useCallback(
    (id: string | undefined) =>
      <T,>(path: string, init: ApiInit = {}) =>
        api<T>(path, { ...init, clinicId: init.clinicId ?? id }),
    [api],
  );
  const call = useCallback(
    <T,>(path: string, init?: ApiInit) => callFor(clinicId)<T>(path, init),
    [callFor, clinicId],
  );

  // Resume: read the clinic and its saved step once.
  useEffect(() => {
    // Resume only for a clinic present at mount; later router.refresh() prop changes must not reset the step.
    if (!initialClinic || resumed.current) return;
    resumed.current = true;
    const live = true;
    (async () => {
      try {
        if (cookieStale) writeActiveClinicCookie(initialClinic.id);
        const c = callFor(initialClinic.id);
        const [detail, saved] = await Promise.all([
          c<{ clinic: ClinicRow }>(`/v1/clinics/${initialClinic.id}`),
          c<{ step: string | null }>("/v1/onboarding"),
        ]);
        if (!live) return;
        setClinic(toInfo(detail.clinic));
        const s = resumeStep(saved.step, true);
        if (s === "done") router.replace("/app");
        else setStep(s);
      } catch (e) {
        if (live) setLoadError(errMsg(e));
      }
    })();
  }, [initialClinic, cookieStale, callFor, router]);

  async function go(to: OnboardingStep, id = clinicId) {
    await callFor(id)("/v1/onboarding/step", { method: "PUT", body: { step: to } });
    setStep(to);
    window.scrollTo?.({ top: 0 });
  }
  const advance = (from: OnboardingStep) => () => go(nextStep(from));
  const back = (from: OnboardingStep) => () => go(prevStep(from));

  async function activate(c: ClinicInfo) {
    writeActiveClinicCookie(c.id);
    setClinic(c);
    router.refresh();
  }

  async function onCreated(c: ClinicInfo) {
    await activate(c);
    await go("doctors", c.id);
  }

  async function onDemo() {
    const res = await callFor(undefined)<{ clinic: ClinicRow }>("/v1/clinics", {
      method: "POST",
      body: SUNRISE_BASICS,
    });
    const info = toInfo(res.clinic);
    if (!info.languages.length) info.languages = [...SUNRISE_BASICS.languages];
    await activate(info);
    await callFor(info.id)("/v1/demo/load", { method: "POST" });
    await go("review", info.id);
  }

  async function onFinish() {
    await go("done");
    router.push("/app/assistant/try");
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <ErrorNote message={loadError} />
        <button
          type="button"
          onClick={() => router.refresh()}
          className="border-line bg-surface min-h-11 rounded-lg border px-5 font-medium outline-none focus-visible:ring-4 focus-visible:ring-accent-soft"
        >
          Try again
        </button>
      </div>
    );
  }
  if (step === null) {
    return (
      <p role="status" className="text-muted">
        Loading your setup…
      </p>
    );
  }

  const langs: LanguageCode[] = clinic?.languages.length ? clinic.languages : ["en-IN"];

  return (
    <div>
      <Progress step={step} />
      {step === "basics" ? (
        <StepBasics
          clinic={clinic}
          call={call}
          onCreated={onCreated}
          onContinue={advance("basics")}
          onDemo={onDemo}
        />
      ) : null}
      {step === "doctors" && clinic ? (
        <StepDoctors
          call={call}
          clinicLanguages={langs}
          onBack={back("doctors")}
          onContinue={advance("doctors")}
        />
      ) : null}
      {step === "services" && clinic ? (
        <StepServices call={call} onBack={back("services")} onContinue={advance("services")} />
      ) : null}
      {step === "assistant" && clinic ? (
        <StepAssistant
          call={call}
          clinicId={clinic.id}
          clinicName={clinic.name}
          languages={langs}
          onBack={back("assistant")}
          onContinue={advance("assistant")}
        />
      ) : null}
      {step === "review" && clinic ? (
        <StepReview
          call={call}
          clinicName={clinic.name}
          onEdit={(s) => go(s)}
          onBack={back("review")}
          onFinish={onFinish}
        />
      ) : null}
    </div>
  );
}
