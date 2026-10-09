"use client";

import { useEffect, useMemo } from "react";
import {
  FIXTURE_CLINIC_ID,
  assistantProfile,
  clinic as demoClinic,
  doctors as demoDoctors,
  services as demoServices,
  slotRules as demoRules,
} from "@/components/dev/fixtures";
import { Wizard } from "@/components/onboarding/Wizard";
import { ApiError, type ApiInit } from "@/lib/api";
import { DENTAL_SERVICE_DEFAULTS, type OnboardingStep } from "@/lib/onboarding";

/**
 * The real Wizard against an in-memory fixture API. "Fresh" matches the prototype's renders (a new
 * clinic speaking English and Kannada, nothing saved yet); `demo` is the loaded Sunrise clinic.
 */

export type WizardScenario = {
  step: OnboardingStep;
  demo: boolean;
  /** "" · "error" (saves fail, Continue is pressed) · "loading" · "load-error" · "demo-failed" */
  state: string;
};

const DELAY = 250;
const wait = () => new Promise((r) => setTimeout(r, DELAY));
const never = () => new Promise<never>(() => undefined);

function makeApi({ step, demo, state }: WizardScenario) {
  const languages = demo ? demoClinic.languages : ["en-IN", "kn-IN"];
  const db = {
    step: step as string,
    clinic: { ...demoClinic, languages },
    doctors: demo ? demoDoctors.map((d) => ({ id: d.id, name: d.name })) : [],
    // The step-5 render lists the five ticked default services.
    services: demo
      ? demoServices.map((s) => ({
          name: s.name,
          durationMin: s.durationMin,
          priceInr: s.priceInr,
        }))
      : step === "review"
        ? DENTAL_SERVICE_DEFAULTS.slice(0, 5).map((s) => ({
            name: s.name,
            durationMin: s.durationMin,
            priceInr: s.priceInr,
          }))
        : [],
    slotRules: demo ? demoRules : null,
    assistant: demo ? assistantProfile : { name: "Muxaris" },
    n: 0,
  };
  const fail = () => {
    throw new ApiError(500, "preview", "Could not save. Please try again.");
  };

  return async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
    const key = `${init.method ?? "GET"} ${path}`;
    const body = (init.body ?? {}) as Record<string, unknown>;
    if (state === "loading" && key === "GET /v1/onboarding") return never();
    // Reads answer at once (stable screenshots); saves take a beat so busy states show.
    if (!key.startsWith("GET ")) await wait();
    if (state === "load-error" && key.startsWith("GET /v1/clinics/"))
      throw new ApiError(500, "preview", "We couldn’t load your setup. Please try again.");
    if (state === "error" && key.split(" ")[0] !== "GET") fail();
    const out = ((): unknown => {
      if (key === "GET /v1/onboarding") return { step: db.step };
      if (key.startsWith("GET /v1/clinics/")) return { clinic: db.clinic };
      if (key === "PUT /v1/onboarding/step") {
        db.step = String(body.step);
        return {};
      }
      if (key === "POST /v1/clinics") {
        db.clinic = { ...db.clinic, ...body, id: FIXTURE_CLINIC_ID } as typeof db.clinic;
        return { clinic: db.clinic };
      }
      if (key === "POST /v1/demo/load") {
        if (state === "demo-failed") fail();
        db.doctors = demoDoctors.map((d) => ({ id: d.id, name: d.name }));
        return { ok: true };
      }
      if (key === "GET /v1/doctors") return { doctors: db.doctors };
      if (key === "POST /v1/doctors") {
        const doctor = { id: `d${++db.n}`, name: String(body.name) };
        db.doctors.push(doctor);
        return { doctor };
      }
      if (key.startsWith("PUT /v1/doctors/")) return {};
      if (key === "GET /v1/services") return { services: db.services };
      if (key === "POST /v1/services") {
        db.services.push(body as never);
        return { service: body };
      }
      if (key === "GET /v1/slot-rules") return { slotRules: db.slotRules };
      if (key === "PUT /v1/slot-rules") return { slotRules: body };
      if (key === "GET /v1/assistant") return { assistant: db.assistant };
      if (key === "PUT /v1/assistant") {
        db.assistant = body as never;
        return { assistant: body };
      }
      return {};
    })();
    return out as T;
  };
}

/** Presses a button by its text once it appears (error and demo-failed scenarios). */
function usePress(label: string | null) {
  useEffect(() => {
    if (!label) return;
    let tries = 0;
    const t = setInterval(() => {
      const b = Array.from(document.querySelectorAll("button")).find(
        (x) => x.textContent?.trim() === label && !x.disabled,
      );
      if (b || ++tries > 40) {
        clearInterval(t);
        b?.click();
      }
    }, 100);
    return () => clearInterval(t);
  }, [label]);
}

export function WizardPreview(scenario: WizardScenario) {
  const { step, demo, state } = scenario;
  const api = useMemo(() => makeApi({ step, demo, state }), [step, demo, state]);
  usePress(
    state === "demo-failed"
      ? "Load demo clinic"
      : state === "error"
        ? step === "review"
          ? "Finish"
          : "Continue"
        : null,
  );
  // A fresh first step has no clinic yet, so the wizard starts without one (no resume fetch).
  const fresh = step === "basics" && !demo && state !== "loading" && state !== "load-error";
  return (
    <Wizard
      key={`${step}-${demo}-${state}`}
      api={api}
      cookieStale={false}
      initialClinic={fresh ? null : { id: FIXTURE_CLINIC_ID, name: demoClinic.name }}
    />
  );
}
