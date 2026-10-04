"use client";

import { useState } from "react";
import {
  CITIES,
  LANGUAGES,
  SPECIALTIES,
  SPECIALTY_LABELS,
  createClinicBody,
  type LanguageCode,
} from "@muxaris/shared";
import {
  Btn,
  Check,
  ErrorNote,
  SelectField,
  StepShell,
  TextField,
  errMsg,
  issueMap,
  type Call,
} from "./ui";

export interface ClinicInfo {
  id: string;
  name: string;
  languages: LanguageCode[];
  city?: string | null;
  phone?: string | null;
}

export const SUNRISE_BASICS = {
  name: "Sunrise Dental Care",
  city: "Bengaluru",
  specialty: "dental",
  languages: LANGUAGES.map((l) => l.code),
};

export function StepBasics({
  clinic,
  call,
  onCreated,
  onContinue,
  onDemo,
}: {
  clinic: ClinicInfo | null;
  call: Call;
  onCreated: (c: ClinicInfo) => Promise<void>;
  onContinue: () => Promise<void>;
  onDemo: () => Promise<void>;
}) {
  const [name, setName] = useState(clinic?.name ?? "");
  const [specialty, setSpecialty] = useState("dental");
  const [city, setCity] = useState(clinic?.city ?? "Bengaluru");
  const [phone, setPhone] = useState(clinic?.phone ?? "");
  const [langs, setLangs] = useState<LanguageCode[]>(clinic?.languages ?? ["en-IN", "kn-IN"]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"submit" | "demo" | null>(null);
  const locked = clinic !== null;

  async function run(kind: "submit" | "demo", fn: () => Promise<void>) {
    setError(null);
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (locked) return run("submit", onContinue);
    const body = {
      name,
      specialty,
      city,
      languages: langs,
      ...(phone.trim() ? { phone: phone.trim() } : {}),
    };
    const parsed = createClinicBody.safeParse(body);
    if (!parsed.success) {
      const m = issueMap(parsed.error.issues);
      if (m.name) m.name = "Enter your clinic name";
      if (m.languages) m.languages = "Pick at least one language";
      setErrors(m);
      return;
    }
    setErrors({});
    await run("submit", async () => {
      const res = await call<{ clinic: { id: string; name: string; languages?: LanguageCode[] } }>(
        "/v1/clinics",
        { method: "POST", body },
      );
      await onCreated({
        id: res.clinic.id,
        name: res.clinic.name,
        languages: res.clinic.languages ?? langs,
        city,
        phone,
      });
    });
  }

  function toggle(code: LanguageCode) {
    setLangs((cur) => (cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code]));
  }

  return (
    <form onSubmit={submit} noValidate>
      <StepShell
        title="Tell us about your clinic"
        lead="This is what your assistant will introduce itself with."
        footer={
          <>
            <span />
            <Btn type="submit" busy={busy === "submit"}>
              Continue
            </Btn>
          </>
        }
      >
        {!locked ? (
          <div className="border-line bg-paper rounded-xl border p-4">
            <p className="text-sm">
              Just exploring? Fill in a ready-made dental clinic and skip ahead.
            </p>
            <Btn
              variant="secondary"
              className="mt-3"
              busy={busy === "demo"}
              onClick={() => run("demo", onDemo)}
            >
              Load demo clinic
            </Btn>
          </div>
        ) : (
          <p className="text-muted text-sm">
            Your clinic is created. You can edit these details later in settings.
          </p>
        )}
        <TextField
          label="Clinic name"
          value={name}
          disabled={locked}
          error={errors.name}
          autoComplete="organization"
          onChange={(e) => setName(e.target.value)}
        />
        <div className="grid gap-6 sm:grid-cols-2">
          <SelectField
            label="Specialty"
            value={specialty}
            disabled={locked}
            onChange={(e) => setSpecialty(e.target.value)}
            options={SPECIALTIES.map((s) => ({ value: s, label: SPECIALTY_LABELS[s] }))}
          />
          <SelectField
            label="City"
            value={city}
            disabled={locked}
            onChange={(e) => setCity(e.target.value)}
            options={CITIES.map((c) => ({ value: c, label: c }))}
          />
        </div>
        <fieldset disabled={locked}>
          <legend className="text-ink text-sm font-medium">Languages your patients speak</legend>
          <div className="mt-1 grid gap-x-6 sm:grid-cols-2">
            {LANGUAGES.map((l) => (
              <Check
                key={l.code}
                label={`${l.label} (${l.native})`}
                checked={langs.includes(l.code)}
                onChange={() => toggle(l.code)}
              />
            ))}
          </div>
          {errors.languages ? <p className="text-danger mt-1 text-sm">{errors.languages}</p> : null}
        </fieldset>
        <TextField
          label="Clinic phone (optional)"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          disabled={locked}
          error={errors.phone}
          hint="Indian mobile number, for example 98765 43210"
          onChange={(e) => setPhone(e.target.value)}
        />
        <ErrorNote message={error} />
      </StepShell>
    </form>
  );
}
