"use client";

import { useState } from "react";
import { LANGUAGES, type Doctor } from "@muxaris/shared";
import { Button, Checkbox, Field, Input, Modal, Switch, cn, useToast } from "@/components/ui";
import { useApi } from "@/lib/api-client";
import {
  DISPLAY_WEEKDAYS,
  WEEKDAY_NAMES,
  defaultWeekHours,
  validateWeekHours,
  weekHoursPayload,
  type WeekHours,
} from "@/lib/onboarding";
import { saveErrorText, weekFromHours } from "./format";
import { ToggleChips } from "./settings-ui";

/** Colour the design gives a newly added doctor's avatar. */
const NEW_DOCTOR_COLOR = "#c2771b";

interface Draft {
  name: string;
  title: string;
  specialties: string;
  languages: string[];
  active: boolean;
  week: WeekHours;
}

function toDraft(doctor: Doctor | null, clinicLanguages: string[]): Draft {
  if (!doctor) {
    return {
      name: "",
      title: "",
      specialties: "",
      languages: clinicLanguages.slice(0, 2),
      active: true,
      week: defaultWeekHours(),
    };
  }
  return {
    name: doctor.name,
    title: doctor.title ?? "",
    specialties: doctor.specialties.join(", "),
    languages: [...doctor.languages],
    active: doctor.active,
    week: weekFromHours(doctor.workingHours).week,
  };
}

const splitList = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
const sameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Settings → Doctors drawer: add a doctor (POST, then PUT hours) or edit one in place (PATCH the
 * changed fields; PUT hours only when they changed, so split shifts are never flattened by a save
 * that did not touch them).
 */
export function DoctorDrawer({
  doctor,
  clinicLanguages,
  onClose,
  onSaved,
}: {
  /** null adds a new doctor. */
  doctor: Doctor | null;
  clinicLanguages: string[];
  onClose: () => void;
  onSaved: (doctor: Doctor) => void;
}) {
  const api = useApi();
  const { toast } = useToast();
  const [draft, setDraft] = useState<Draft>(() => toDraft(doctor, clinicLanguages));
  // The server's copy of this doctor: the one being edited, or the one this drawer has already
  // created. A retry after a failed hours save then updates it instead of POSTing a duplicate.
  const [current, setCurrent] = useState<Doctor | null>(doctor);
  // The week last saved for `current` (null until a new doctor's hours are saved).
  const [savedWeek, setSavedWeek] = useState(() => (doctor ? JSON.stringify(draft.week) : null));
  const [split] = useState(() => !!doctor && weekFromHours(doctor.workingHours).split);
  const [nameBad, setNameBad] = useState(false);
  const [langBad, setLangBad] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hourErrors = validateWeekHours(draft.week);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setDay = (day: number, patch: Partial<WeekHours[number]>) =>
    setDraft((d) => ({ ...d, week: d.week.map((x, i) => (i === day ? { ...x, ...patch } : x)) }));

  async function save() {
    const name = draft.name.trim();
    setNameBad(!name);
    setLangBad(!draft.languages.length);
    if (!name || !draft.languages.length || Object.keys(hourErrors).length) return;
    setBusy(true);
    setError(null);
    const fields = {
      name,
      title: draft.title.trim() || null,
      specialties: splitList(draft.specialties),
      languages: draft.languages,
      active: draft.active,
    };
    const week = JSON.stringify(draft.week);
    let saved: Doctor | null = null;
    try {
      if (current) {
        const patch: Record<string, unknown> = {};
        if (fields.name !== current.name) patch.name = fields.name;
        if (fields.title !== current.title) patch.title = fields.title;
        if (!sameList(fields.specialties, current.specialties))
          patch.specialties = fields.specialties;
        if (!sameList(fields.languages, current.languages)) patch.languages = fields.languages;
        if (fields.active !== current.active) patch.active = fields.active;
        saved = Object.keys(patch).length
          ? {
              ...(
                await api<{ doctor: Doctor }>(`/v1/doctors/${encodeURIComponent(current.id)}`, {
                  method: "PATCH",
                  body: patch,
                })
              ).doctor,
              workingHours: current.workingHours,
            }
          : current;
      } else {
        saved = (
          await api<{ doctor: Doctor }>("/v1/doctors", {
            method: "POST",
            body: {
              name: fields.name,
              ...(fields.title ? { title: fields.title } : {}),
              specialties: fields.specialties,
              languages: fields.languages,
              color: NEW_DOCTOR_COLOR,
              active: fields.active,
            },
          })
        ).doctor;
        saved = { ...saved, workingHours: [] };
      }
      setCurrent(saved);
      if (week !== savedWeek) {
        const workingHours = weekHoursPayload(draft.week);
        await api(`/v1/doctors/${encodeURIComponent(saved.id)}/hours`, {
          method: "PUT",
          body: { hours: workingHours },
        });
        saved = { ...saved, workingHours };
        setCurrent(saved);
        setSavedWeek(week);
      }
      onSaved(saved);
      toast(doctor ? "Doctor updated" : "Doctor added");
      onClose();
    } catch (e) {
      // The doctor may have saved before its hours failed: list it now; a retry re-sends only
      // what is still unsaved.
      if (saved) onSaved(saved);
      setError(saveErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      variant="drawer"
      width={460}
      title={doctor ? "Edit doctor" : "Add doctor"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size={40} onClick={onClose}>
            Cancel
          </Button>
          <Button size={40} onClick={() => void save()} disabled={busy} className="px-[18px]">
            Save doctor
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-[12px]">
        <Field label="Name" error={nameBad ? "Enter the doctor's name" : undefined}>
          <Input
            value={draft.name}
            onChange={(e) => {
              set("name", e.target.value);
              setNameBad(false);
            }}
          />
        </Field>
        <Field label="Title (optional)">
          <Input
            value={draft.title}
            placeholder="BDS, MDS"
            onChange={(e) => set("title", e.target.value)}
          />
        </Field>
      </div>
      <Field label="Specialties">
        <Input value={draft.specialties} onChange={(e) => set("specialties", e.target.value)} />
      </Field>
      <div className="flex flex-col gap-[8px]">
        <span className="text-ink-2 text-[13px] font-medium">Languages spoken</span>
        <ToggleChips
          size={32}
          label="Languages spoken"
          options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
          value={draft.languages}
          onChange={(v) => {
            set("languages", v);
            setLangBad(false);
          }}
        />
        {langBad ? <span className="text-rose text-[12px]">Pick at least one language</span> : null}
      </div>
      <div className="flex flex-col gap-[8px]">
        <span className="text-ink-2 text-[13px] font-medium">Working hours</span>
        <div className="border-line flex flex-col overflow-hidden rounded-12 border">
          {DISPLAY_WEEKDAYS.map((day) => {
            const d = draft.week[day]!;
            const name = WEEKDAY_NAMES[day]!;
            const bad = !!hourErrors[day];
            return (
              <div
                key={day}
                className="border-line-soft grid grid-cols-[120px_minmax(0,1fr)] items-center gap-[10px] border-t px-[12px] py-[7px] max-sm:grid-cols-1 max-sm:gap-[6px]"
              >
                <Checkbox
                  label={name}
                  checked={d.open}
                  onChange={(e) => setDay(day, { open: e.target.checked })}
                  className="py-[2px]"
                />
                {d.open ? (
                  <div className="flex items-center gap-[8px] max-sm:pl-[26px]">
                    {(["start", "end"] as const).map((k, i) => (
                      <span key={k} className="contents">
                        {i === 1 ? <span className="text-muted-2">–</span> : null}
                        <Input
                          type="time"
                          aria-label={`${name} ${k === "start" ? "opens" : "closes"}`}
                          value={d[k]}
                          invalid={bad}
                          onChange={(e) => setDay(day, { [k]: e.target.value })}
                          className={cn(
                            "h-[32px] w-auto rounded-8 px-[8px] font-mono text-[12.5px]",
                          )}
                        />
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-2 text-[13px] max-sm:hidden">Closed</span>
                )}
              </div>
            );
          })}
        </div>
        {split ? (
          <span className="text-muted text-[12px]">
            Some days have a break between shifts. Changing the hours here saves one shift per day.
          </span>
        ) : null}
        {Object.keys(hourErrors).length ? (
          <span className="text-rose text-[12px]">
            {Object.values(hourErrors)[0]} (
            {Object.keys(hourErrors)
              .map((d) => WEEKDAY_NAMES[+d])
              .join(", ")}
            )
          </span>
        ) : null}
      </div>
      <div className="bg-subtle border-chip flex items-center justify-between gap-[12px] rounded-12 border px-[14px] py-[12px]">
        <div className="flex flex-col">
          <span id="doctor-active-label" className="text-[14px] font-semibold">
            Active
          </span>
          <span className="text-muted text-[12.5px]">
            Inactive doctors are never offered to callers.
          </span>
        </div>
        <Switch
          checked={draft.active}
          onCheckedChange={(v) => set("active", v)}
          aria-labelledby="doctor-active-label"
        />
      </div>
      {error ? (
        <p role="alert" className="text-rose m-0 text-[13px]">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
