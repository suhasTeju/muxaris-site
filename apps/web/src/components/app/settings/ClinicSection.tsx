"use client";

import { useState } from "react";
import { CITIES, LANGUAGES, clinicPhone, type Clinic } from "@muxaris/shared";
import { Field, Input, Select, useToast } from "@/components/ui";
import { useApi } from "@/lib/api-client";
import { languageLabel } from "@/lib/dashboard";
import { formatPhone } from "../format";
import { saveErrorText, timezoneLabel } from "./format";
import {
  DefList,
  EditActions,
  OwnerOnlyNote,
  SectionError,
  SettingsSection,
  ToggleChips,
} from "./settings-ui";

interface Draft {
  name: string;
  city: string;
  address: string;
  phone: string;
  languages: string[];
}

const toDraft = (c: Clinic): Draft => ({
  name: c.name,
  city: c.city,
  address: c.address ?? "",
  phone: formatPhone(c.phone),
  languages: [...c.languages],
});

/** Settings → Clinic: the clinic's details, edited in place by the owner (PATCH /v1/clinic). */
export function ClinicSection({
  clinic,
  isOwner,
  onSaved,
}: {
  clinic: Clinic;
  isOwner: boolean;
  onSaved: (clinic: Clinic) => void;
}) {
  const api = useApi();
  const { toast } = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  function cancel() {
    setDraft(null);
    setErrors({});
    setError(null);
  }

  async function save() {
    if (!draft) return;
    const next: Partial<Record<keyof Draft, string>> = {};
    if (!draft.name.trim()) next.name = "Enter the clinic's name";
    const phone = draft.phone.trim() ? clinicPhone.safeParse(draft.phone) : null;
    if (phone && !phone.success) next.phone = "Enter a valid Indian phone number";
    if (!draft.languages.length) next.languages = "Pick at least one language";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ clinic: Clinic }>("/v1/clinic", {
        method: "PATCH",
        body: {
          name: draft.name.trim(),
          city: draft.city,
          address: draft.address.trim() || null,
          phone: phone?.success ? phone.data : null,
          // Keep the clinic's order (its first language is the default); new ones follow.
          languages: [
            ...clinic.languages.filter((c) => draft.languages.includes(c)),
            ...LANGUAGES.map((l) => l.code).filter(
              (c) => draft.languages.includes(c) && !clinic.languages.includes(c),
            ),
          ],
        },
      });
      onSaved(r.clinic);
      setDraft(null);
      toast("Clinic details saved");
    } catch (e) {
      setError(saveErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  const cities: string[] = (CITIES as readonly string[]).includes(clinic.city)
    ? [...CITIES]
    : [clinic.city, ...CITIES];

  return (
    <SettingsSection
      id="set-clinic"
      title="Clinic"
      aside={
        isOwner ? (
          <EditActions
            editing={!!draft}
            busy={busy}
            label="clinic details"
            onEdit={() => setDraft(toDraft(clinic))}
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
          <div className="grid grid-cols-1 gap-[14px] px-[20px] pt-[18px] pb-[20px] sm:grid-cols-2">
            <Field label="Name" error={errors.name}>
              <Input value={draft.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="City">
              <Select value={draft.city} onChange={(e) => set("city", e.target.value)}>
                {cities.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Address">
              <Input value={draft.address} onChange={(e) => set("address", e.target.value)} />
            </Field>
            <Field label="Phone" error={errors.phone}>
              <Input
                type="tel"
                inputMode="tel"
                value={draft.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </Field>
            <div className="flex flex-col gap-[8px] sm:col-span-2">
              <span className="text-ink-2 text-[13px] font-medium">Languages</span>
              <ToggleChips
                label="Languages"
                options={LANGUAGES.map((l) => ({
                  value: l.code,
                  label: `${l.label} · ${l.native}`,
                }))}
                value={draft.languages}
                onChange={(v) => set("languages", v)}
              />
              {errors.languages ? (
                <span className="text-rose text-[12px]">{errors.languages}</span>
              ) : null}
            </div>
          </div>
          {error ? <SectionError>{error}</SectionError> : null}
        </>
      ) : (
        <DefList
          rows={[
            ["Name", clinic.name],
            ["City", clinic.city],
            ["Address", clinic.address || "-"],
            ["Phone", formatPhone(clinic.phone) || "-"],
            ["Timezone", timezoneLabel(clinic.timezone)],
            ["Languages", clinic.languages.map(languageLabel).join(", ")],
          ]}
        />
      )}
    </SettingsSection>
  );
}
