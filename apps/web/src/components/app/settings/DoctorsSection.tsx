"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { Doctor } from "@muxaris/shared";
import { Button } from "@/components/ui";
import { DoctorDrawer } from "./DoctorDrawer";
import { hoursSummary, languageName } from "./format";
import { OwnerOnlyNote, SectionEmpty, SettingsSection } from "./settings-ui";

/** "Dr. Meera Rao" → "MR". */
export function initials(name: string): string {
  return name
    .replace(/^Dr\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** Settings → Doctors: one row per doctor; owners add or edit them in a drawer. */
export function DoctorsSection({
  doctors,
  clinicLanguages,
  isOwner,
  onSaved,
}: {
  doctors: Doctor[];
  clinicLanguages: string[];
  isOwner: boolean;
  onSaved: (doctor: Doctor) => void;
}) {
  // undefined: closed; null: adding; a doctor: editing it.
  const [editing, setEditing] = useState<Doctor | null | undefined>(undefined);
  return (
    <SettingsSection
      id="set-doctors"
      title="Doctors"
      aside={
        isOwner ? (
          <Button variant="secondary" size={32} icon={Plus} onClick={() => setEditing(null)}>
            Add doctor
          </Button>
        ) : (
          <OwnerOnlyNote />
        )
      }
    >
      {doctors.length === 0 ? <SectionEmpty>No doctors added yet.</SectionEmpty> : null}
      {doctors.map((d) => {
        const sub = [
          d.specialties.join(", "),
          d.languages.map(languageName).join(", "),
          hoursSummary(d.workingHours),
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <div
            key={d.id}
            className="border-line-soft grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-[14px] border-t px-[20px] py-[14px]"
          >
            <span
              aria-hidden="true"
              className="grid size-[40px] place-items-center rounded-12 text-[13px] font-semibold"
              style={{ background: `${d.color}1f`, color: d.color }}
            >
              {initials(d.name)}
            </span>
            <div className="flex min-w-0 flex-col gap-[3px]">
              <span className="flex items-center gap-[8px] text-[14.5px] font-semibold">
                {d.name}
                {d.title ? ` · ${d.title}` : ""}
                {!d.active ? (
                  <span className="bg-chip text-ink-3 grid h-[20px] place-items-center rounded-6 px-[7px] text-[11.5px] font-medium">
                    (inactive)
                  </span>
                ) : null}
              </span>
              <span className="text-muted text-[13px]">{sub}</span>
            </div>
            {isOwner ? (
              <Button
                variant="secondary"
                size={32}
                onClick={() => setEditing(d)}
                aria-label={`Edit ${d.name}`}
              >
                Edit
              </Button>
            ) : null}
          </div>
        );
      })}
      {editing !== undefined ? (
        <DoctorDrawer
          key={editing?.id ?? "new"}
          doctor={editing}
          clinicLanguages={clinicLanguages}
          onClose={() => setEditing(undefined)}
          onSaved={onSaved}
        />
      ) : null}
    </SettingsSection>
  );
}
