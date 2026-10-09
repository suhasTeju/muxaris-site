"use client";

import { useEffect, useState } from "react";
import { LANGUAGES, doctorBody, workingHoursBody, type LanguageCode } from "@muxaris/shared";
import {
  defaultWeekHours,
  validateWeekHours,
  weekHoursPayload,
  type WeekHours,
} from "@/lib/onboarding";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { LangChip, StepFooter, StepShell, TextField, errMsg, useStepBusy, type Call } from "./ui";
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
  // Per draft: which field to mark ("name" or "languages").
  const [fieldErr, setFieldErr] = useState<Record<number, "name" | "languages">>({});
  const [stepErr, setStepErr] = useState<string | null>(null);
  const [busy, setBusy] = useStepBusy(false);

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
      setFieldErr({ [drafts[0]!.key]: "name" });
      setStepErr("Add at least one doctor");
      return;
    }
    const errs: Record<number, "name" | "languages"> = {};
    let badHours = false;
    for (const d of active) {
      const doc = doctorBody.safeParse({
        name: d.name,
        ...(d.title.trim() ? { title: d.title } : {}),
        languages: d.languages,
      });
      if (!doc.success) errs[d.key] = d.languages.length ? "name" : "languages";
      else if (Object.keys(validateWeekHours(d.week)).length) badHours = true;
      else if (!workingHoursBody.safeParse({ hours: weekHoursPayload(d.week) }).success)
        badHours = true;
    }
    setFieldErr(errs);
    setStepErr(badHours ? "Fix the working hours below" : null);
    if (Object.keys(errs).length || badHours) return;

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
        error={error ?? stepErr}
        gap="gap-[18px]"
        footer={<StepFooter onBack={() => void onBack()} busy={busy} />}
      >
        {existing.length ? (
          <p className="text-muted m-0 text-[13.5px]">
            Already added: {existing.map((d) => d.name).join(", ")}
          </p>
        ) : null}
        {drafts.map((d, i) => {
          const labelId = `doc-${d.key}-label`;
          const langsId = `doc-${d.key}-langs`;
          return (
            <fieldset
              key={d.key}
              aria-labelledby={labelId}
              disabled={busy || Boolean(d.id && d.hoursSaved)}
              className="border-line bg-subtle m-0 flex min-w-0 flex-col gap-[18px] rounded-18 border p-[16px] sm:p-[22px]"
            >
              <div className="flex items-center justify-between">
                <span
                  id={labelId}
                  className="text-teal-ink font-mono text-[11.5px] tracking-[0.1em] uppercase"
                >
                  Doctor {existing.length + i + 1}
                </span>
                {drafts.length > 1 && !d.id ? (
                  <Button
                    variant="danger-ghost"
                    size={32}
                    onClick={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))}
                    className="rounded-9 text-[13.5px]"
                  >
                    Remove doctor
                  </Button>
                ) : null}
              </div>
              <div className="grid gap-[14px] sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                <TextField
                  label="Name"
                  value={d.name}
                  error={fieldErr[d.key] === "name" ? "Enter the doctor's name" : undefined}
                  onChange={(e) => patch(d.key, { name: e.target.value })}
                />
                <TextField
                  label="Title (optional)"
                  placeholder="BDS, MDS"
                  value={d.title}
                  onChange={(e) => patch(d.key, { title: e.target.value })}
                />
              </div>
              <div role="group" aria-labelledby={langsId} className="flex flex-col gap-[10px]">
                <span id={langsId} className="text-ink-2 text-[13.5px] font-medium">
                  Languages spoken
                </span>
                <div className="flex flex-wrap gap-[8px]">
                  {LANGUAGES.map((l) => (
                    <LangChip
                      key={l.code}
                      size={34}
                      label={`${l.label} (${l.native})`}
                      on={d.languages.includes(l.code)}
                      onToggle={() =>
                        patch(d.key, {
                          languages: d.languages.includes(l.code)
                            ? d.languages.filter((c) => c !== l.code)
                            : [...d.languages, l.code],
                        })
                      }
                    />
                  ))}
                </div>
                {fieldErr[d.key] === "languages" ? (
                  <span className="text-rose text-[12.5px]">Pick at least one language</span>
                ) : null}
              </div>
              <WorkingHoursGrid
                idPrefix={`doc-${d.key}`}
                value={d.week}
                onChange={(week) => patch(d.key, { week, hoursSaved: false })}
              />
            </fieldset>
          );
        })}
        <Button
          variant="dashed"
          size={44}
          block
          icon={Plus}
          iconSize={15}
          onClick={() => setDrafts((ds) => [...ds, blank(clinicLanguages)])}
          className="text-ink-2 h-[46px] rounded-14 border-[1.5px] border-[#c6d0db] text-[14.5px] hover:bg-[#f3fafa]"
        >
          Add another doctor
        </Button>
      </StepShell>
    </form>
  );
}
