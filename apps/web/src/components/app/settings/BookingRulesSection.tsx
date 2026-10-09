"use client";

import { useState } from "react";
import { slotRulesBody, type SlotRules } from "@muxaris/shared";
import { Field, Input, Switch, useToast } from "@/components/ui";
import { useApi } from "@/lib/api-client";
import { saveErrorText } from "./format";
import { DefList, EditActions, OwnerOnlyNote, SectionError, SettingsSection } from "./settings-ui";

type NumKey = "slotGrainMin" | "leadTimeMin" | "maxDaysAhead" | "maxPerSlot";
type Draft = Record<NumKey, string> & { allowSameDay: boolean };

const FIELDS: Array<[NumKey, string, string]> = [
  ["slotGrainMin", "Slot grain (min)", "Use 5 to 60 minutes."],
  ["leadTimeMin", "Lead time (min)", "Use 0 to 1,440 minutes."],
  ["maxDaysAhead", "Book up to (days ahead)", "Use 1 to 365 days."],
  ["maxPerSlot", "Max per slot", "Use 1 to 10."],
];

/** Settings → Booking rules: the slot engine's limits (PUT /v1/slot-rules). */
export function BookingRulesSection({
  rules,
  isOwner,
  onSaved,
}: {
  rules: SlotRules;
  isOwner: boolean;
  onSaved: (rules: SlotRules) => void;
}) {
  const api = useApi();
  const { toast } = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Partial<Record<NumKey, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function edit() {
    setDraft({
      slotGrainMin: String(rules.slotGrainMin),
      leadTimeMin: String(rules.leadTimeMin),
      maxDaysAhead: String(rules.maxDaysAhead),
      maxPerSlot: String(rules.maxPerSlot),
      allowSameDay: rules.allowSameDay,
    });
  }
  function cancel() {
    setDraft(null);
    setErrors({});
    setError(null);
  }

  async function save() {
    if (!draft) return;
    const num = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN);
    const body = {
      slotGrainMin: num(draft.slotGrainMin),
      leadTimeMin: num(draft.leadTimeMin),
      maxDaysAhead: num(draft.maxDaysAhead),
      maxPerSlot: num(draft.maxPerSlot),
      allowSameDay: draft.allowSameDay,
    };
    const parsed = slotRulesBody.safeParse(body);
    if (!parsed.success) {
      const next: Partial<Record<NumKey, string>> = {};
      for (const i of parsed.error.issues) {
        const k = i.path[0] as NumKey;
        next[k] ??= FIELDS.find(([f]) => f === k)?.[2] ?? "Check this value.";
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ slotRules: SlotRules }>("/v1/slot-rules", {
        method: "PUT",
        body: parsed.data,
      });
      onSaved(r.slotRules);
      setDraft(null);
      toast("Booking rules saved");
    } catch (e) {
      setError(saveErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsSection
      id="set-rules"
      title="Booking rules"
      aside={
        isOwner ? (
          <EditActions
            editing={!!draft}
            busy={busy}
            label="booking rules"
            onEdit={edit}
            onCancel={cancel}
            onSave={() => void save()}
          />
        ) : (
          <OwnerOnlyNote />
        )
      }
    >
      {draft ? (
        <>
          <div className="grid grid-cols-1 gap-[14px] px-[20px] pt-[18px] pb-[20px] sm:grid-cols-2 lg:grid-cols-3">
            {FIELDS.map(([k, label]) => (
              <Field key={k} label={label} error={errors[k]}>
                <Input
                  type="number"
                  min={0}
                  mono
                  value={draft[k]}
                  onChange={(e) => setDraft((d) => d && { ...d, [k]: e.target.value })}
                />
              </Field>
            ))}
            <div className="flex items-end gap-[10px] pb-[9px]">
              <Switch
                checked={draft.allowSameDay}
                onCheckedChange={(v) => setDraft((d) => d && { ...d, allowSameDay: v })}
                aria-label="Same-day booking"
              />
              <span className="text-[13.5px] font-medium">Same-day booking</span>
            </div>
          </div>
          {error ? <SectionError>{error}</SectionError> : null}
        </>
      ) : (
        <DefList
          cols={3}
          rows={[
            ["Slot grain", `${rules.slotGrainMin} min`],
            ["Lead time", `${rules.leadTimeMin} min`],
            ["Book up to", `${rules.maxDaysAhead} days ahead`],
            ["Same-day booking", rules.allowSameDay ? "Allowed" : "Not allowed"],
            ["Max per slot", String(rules.maxPerSlot)],
          ]}
        />
      )}
    </SettingsSection>
  );
}
