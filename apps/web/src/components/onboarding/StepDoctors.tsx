"use client";

import { useEffect, useState } from "react";
import { LANGUAGES, doctorBody, workingHoursBody, type LanguageCode } from "@muxaris/shared";
import {
  defaultWeekHours,
  validateWeekHours,
  weekHoursPayload,
  type WeekHours,
} from "@/lib/onboarding";
import { Btn, Check, ErrorNote, StepShell, TextField, errMsg, type Call } from "./ui";
import { WorkingHoursGrid } from "./WorkingHoursGrid";

interface Draft {
  key: number;
  name: string;
  title: string;
  languages: LanguageCode[];
  week: WeekHours;
  /** Set once the doctor exists server side, so a retry never creates a duplicate. */
  id?: string;
  hoursSaved?: boolean;
}

let seq = 0;
const blank = (languages: LanguageCode[]): Draft => ({
  key: ++seq,
  name: "",
  title: "",
  languages,
  week: defaultWeekHours(),
});

export function StepDoctors({
  call,
  clinicLanguages,
  onBack,
  onContinue,
}: {
  call: Call;
  clinicLanguages: LanguageCode[];
  onBack: () => Promise<void>;
  onContinue: () => Promise<void>;
}) {
  const [existing, setExisting] = useState<Array<{ id: string; name: string }>>([]);
  const [drafts, setDrafts] = useState<Draft[]>(() => [blank(clinicLanguages)]);
  const [error, setError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    call<{ doctors: Array<{ id: string; name: string }> }>("/v1/doctors")
      .then((r) => live && setExisting(r.doctors))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [call]);

  const patch = (key: number, p: Partial<Draft>) =>
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...p } : d)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const active = drafts.filter((d) => d.id || d.name.trim() || d.title.trim());
    if (active.length === 0 && existing.length === 0) {
      setFieldErr({ [drafts[0]!.key]: "Add at least one doctor" });
      return;
    }
    const errs: Record<number, string> = {};
    for (const d of active) {
      const doc = doctorBody.safeParse({
        name: d.name,
        ...(d.title.trim() ? { title: d.title } : {}),
        languages: d.languages,
      });
      if (!doc.success)
        errs[d.key] = d.languages.length ? "Enter the doctor's name" : "Pick at least one language";
      else if (Object.keys(validateWeekHours(d.week)).length)
        errs[d.key] = "Fix the working hours below";
      else if (!workingHoursBody.safeParse({ hours: weekHoursPayload(d.week) }).success)
        errs[d.key] = "Fix the working hours below";
    }
    setFieldErr(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      for (const d of active) {
        let id = d.id;
        if (!id) {
          const res = await call<{ doctor: { id: string } }>("/v1/doctors", {
            method: "POST",
            body: {
              name: d.name.trim(),
              ...(d.title.trim() ? { title: d.title.trim() } : {}),
              languages: d.languages,
            },
          });
          id = res.doctor.id;
          patch(d.key, { id });
        }
        if (!d.hoursSaved) {
          await call(`/v1/doctors/${id}/hours`, {
            method: "PUT",
            body: { hours: weekHoursPayload(d.week) },
          });
          patch(d.key, { hoursSaved: true });
        }
      }
      await onContinue();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <StepShell
        title="Who sees patients?"
        lead="Add each doctor and when they are in. The assistant only books inside these hours."
        footer={
          <>
            <Btn variant="ghost" onClick={() => void onBack()}>
              Back
            </Btn>
            <Btn type="submit" busy={busy}>
              Continue
            </Btn>
          </>
        }
      >
        {existing.length ? (
          <p className="text-muted text-sm">
            Already added: {existing.map((d) => d.name).join(", ")}.
          </p>
        ) : null}
        {drafts.map((d, i) => (
          <fieldset
            key={d.key}
            disabled={busy || Boolean(d.id && d.hoursSaved)}
            className="border-line space-y-5 rounded-xl border p-4 sm:p-5"
          >
            <legend className="text-ink px-1 text-sm font-medium">
              Doctor {existing.length + i + 1}
            </legend>
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                label="Name"
                value={d.name}
                onChange={(e) => patch(d.key, { name: e.target.value })}
              />
              <TextField
                label="Title (optional)"
                placeholder="BDS, MDS"
                value={d.title}
                onChange={(e) => patch(d.key, { title: e.target.value })}
              />
            </div>
            <div>
              <p className="text-ink text-sm font-medium">Languages spoken</p>
              <div className="mt-1 grid gap-x-6 sm:grid-cols-2">
                {LANGUAGES.map((l) => (
                  <Check
                    key={l.code}
                    label={l.label}
                    checked={d.languages.includes(l.code)}
                    onChange={() =>
                      patch(d.key, {
                        languages: d.languages.includes(l.code)
                          ? d.languages.filter((c) => c !== l.code)
                          : [...d.languages, l.code],
                      })
                    }
                  />
                ))}
              </div>
            </div>
            <WorkingHoursGrid
              idPrefix={`doc-${d.key}`}
              value={d.week}
              onChange={(week) => patch(d.key, { week, hoursSaved: false })}
            />
            {fieldErr[d.key] ? (
              <p role="alert" className="text-danger text-sm">
                {fieldErr[d.key]}
              </p>
            ) : null}
            {drafts.length > 1 && !d.id ? (
              <Btn
                variant="ghost"
                onClick={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))}
              >
                Remove doctor
              </Btn>
            ) : null}
          </fieldset>
        ))}
        <Btn variant="secondary" onClick={() => setDrafts((ds) => [...ds, blank(clinicLanguages)])}>
          Add another doctor
        </Btn>
        <ErrorNote message={error} />
      </StepShell>
    </form>
  );
}
