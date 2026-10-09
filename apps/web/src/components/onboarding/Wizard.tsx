"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LANGUAGE_CODES, type LanguageCode } from "@muxaris/shared";
import type { ApiInit } from "@/lib/api";
import { useApi } from "@/lib/api-client";
import { Button } from "@/components/ui";
import {
  WIZARD_STEPS,
  nextStep,
  prevStep,
  resumeStep,
  writeActiveClinicCookie,
  type OnboardingStep,
} from "@/lib/onboarding";
import { WizardLayout, WizardLoading } from "./Frame";
import { Progress } from "./Progress";
import { StepAssistant, type VoicePreview } from "./StepAssistant";
import { StepBasics, SUNRISE_BASICS, type ClinicInfo } from "./StepBasics";
import { StepDoctors } from "./StepDoctors";
import { StepReview } from "./StepReview";
import { StepServices } from "./StepServices";
import { NavBusyContext, NavErrorContext, StepBusyContext, StepError, errMsg } from "./ui";

interface ClinicRow {
  id: string;
  name: string;
  city?: string | null;
  specialty?: string | null;
  phone?: string | null;
  languages?: string[] | null;
}

const toInfo = (c: ClinicRow): ClinicInfo => ({
  id: c.id,
  name: c.name,
  city: c.city ?? null,
  specialty: c.specialty ?? null,
  phone: c.phone ?? null,
  languages: (c.languages ?? []).filter((l): l is LanguageCode =>
    (LANGUAGE_CODES as readonly string[]).includes(l),
  ),
});

type Api = ReturnType<typeof useApi>;

const stepIndex = (s: OnboardingStep) => WIZARD_STEPS.indexOf(s);

export function Wizard({
  initialClinic,
  cookieStale,
  api: injectedApi,
  voicePreview,
}: {
  initialClinic: { id: string; name: string } | null;
  cookieStale: boolean;
  /** The API client; defaults to the signed-in user's. Previews pass a fixture handler. */
  api?: Api;
  /** The greeting audio fetcher; defaults to POST /v1/assistant/preview. */
  voicePreview?: VoicePreview;
}) {
  const router = useRouter();
  const signedInApi = useApi();
  const api = injectedApi ?? signedInApi;
  const [clinic, setClinic] = useState<ClinicInfo | null>(
    initialClinic ? { ...initialClinic, languages: [] } : null,
  );
  const [step, setStep] = useState<OnboardingStep | null>(initialClinic ? null : "basics");
  // Furthest step reached, so the rail can jump back and forth between reached steps.
  const [maxStep, setMaxStep] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const clinicId = clinic?.id;
  const resumed = useRef(false);
  const navBusy = useRef(false);
  const [navigating, setNavigating] = useState(false);
  // A step is saving (Continue, Finish, create, demo): the rail must not jump under it.
  const stepBusy = useRef(false);
  const [saving, setSaving] = useState(false);
  const reportBusy = useCallback((busy: boolean) => {
    stepBusy.current = busy;
    setSaving(busy);
  }, []);
  const root = useRef<HTMLElement | null>(null);
  const firstStep = useRef(true);
  const [navError, setNavError] = useState<string | null>(null);
  const [demoFailed, setDemoFailed] = useState(false);

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

  // Resolve the saved step exactly once, at mount, and only when a clinic already exists.
  // Later initialClinic changes (router.refresh() after an in-wizard create) must never refetch it.
  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    if (!initialClinic) return;
    (async () => {
      try {
        if (cookieStale) writeActiveClinicCookie(initialClinic.id);
        const c = callFor(initialClinic.id);
        const [detail, saved] = await Promise.all([
          c<{ clinic: ClinicRow }>(`/v1/clinics/${initialClinic.id}`),
          c<{ step: string | null }>("/v1/onboarding"),
        ]);
        setClinic(toInfo(detail.clinic));
        const s = resumeStep(saved.step, true);
        if (s === "done") router.replace("/app");
        else {
          setStep(s);
          setMaxStep(stepIndex(s));
        }
      } catch (e) {
        setLoadError(errMsg(e));
      }
    })();
  }, [initialClinic, cookieStale, callFor, router]);

  // Move focus to the new step heading (not on first paint).
  useEffect(() => {
    if (step === null) return;
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    root.current?.querySelector<HTMLElement>("h1")?.focus();
  }, [step]);

  async function go(to: OnboardingStep, id = clinicId) {
    await callFor(id)("/v1/onboarding/step", { method: "PUT", body: { step: to } });
    setNavError(null); // a stale Back/Edit error must not outlive a later success
    setStep(to);
    setMaxStep((m) => Math.max(m, stepIndex(to)));
    window.scrollTo?.({ top: 0 });
  }
  const advance = (from: OnboardingStep) => () => go(nextStep(from));
  // Navigation outside a form submit: surface failures inline and ignore concurrent clicks.
  const nav = (fn: () => Promise<void>) => async () => {
    if (navBusy.current || stepBusy.current) return;
    navBusy.current = true;
    setNavigating(true);
    setNavError(null);
    try {
      await fn();
    } catch (e) {
      setNavError(errMsg(e));
    } finally {
      navBusy.current = false;
      setNavigating(false);
    }
  };
  const back = (from: OnboardingStep) => nav(() => go(prevStep(from)));

  async function activate(c: ClinicInfo) {
    resumed.current = true; // the effect must never refetch /onboarding mid-flow
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
    await loadDemo(info.id);
  }

  async function loadDemo(id: string) {
    try {
      await callFor(id)("/v1/demo/load", { method: "POST" });
      await go("review", id);
      setDemoFailed(false);
    } catch (e) {
      // Only a failed load (never the first, in-flight one) shows the retry panel.
      setDemoFailed(true);
      throw e;
    }
  }

  async function onFinish() {
    await go("done");
    router.push("/app/assistant/try");
  }

  if (loadError) {
    return (
      <WizardLayout rail={<Progress step={null} />}>
        <StepError>{loadError}</StepError>
        <Button
          variant="secondary"
          size={44}
          onClick={() => router.refresh()}
          className="self-start"
        >
          Try again
        </Button>
      </WizardLayout>
    );
  }
  if (step === null) return <WizardLoading />;

  const langs: LanguageCode[] = clinic?.languages.length ? clinic.languages : ["en-IN"];

  return (
    <WizardLayout
      mainRef={root}
      rail={
        <Progress
          step={step}
          maxStep={maxStep}
          locked={saving || navigating}
          onGo={(s) => nav(() => go(s))()}
        />
      }
    >
      <StepBusyContext.Provider value={reportBusy}>
        <NavBusyContext.Provider value={navigating}>
          <NavErrorContext.Provider value={navError}>
            {step === "basics" ? (
              <StepBasics
                clinic={clinic}
                call={call}
                onCreated={onCreated}
                onContinue={advance("basics")}
                onDemo={onDemo}
                demoFailed={demoFailed}
                onRetryDemo={() => loadDemo(clinic!.id)}
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
              <StepServices
                call={call}
                onBack={back("services")}
                onContinue={advance("services")}
              />
            ) : null}
            {step === "assistant" && clinic ? (
              <StepAssistant
                call={call}
                clinicId={clinic.id}
                clinicName={clinic.name}
                languages={langs}
                onBack={back("assistant")}
                onContinue={advance("assistant")}
                {...(voicePreview ? { voicePreview } : {})}
              />
            ) : null}
            {step === "review" && clinic ? (
              <StepReview
                call={call}
                clinicName={clinic.name}
                onEdit={(s) => nav(() => go(s))()}
                onBack={back("review")}
                onFinish={onFinish}
              />
            ) : null}
          </NavErrorContext.Provider>
        </NavBusyContext.Provider>
      </StepBusyContext.Provider>
    </WizardLayout>
  );
}
