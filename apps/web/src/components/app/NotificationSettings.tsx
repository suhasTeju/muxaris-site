"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { clinicNotificationSettings, type Clinic } from "@muxaris/shared";
import { Switch, useToast } from "@/components/ui";
import { useApi } from "@/lib/api-client";
import { OwnerOnlyNote, SectionError, SettingsSection } from "./settings/settings-ui";

type Key = "confirmations" | "reminders";
type Values = Record<Key, boolean>;

const ITEMS: Array<{ key: Key; label: string; help: string }> = [
  {
    key: "confirmations",
    label: "Send confirmations",
    help: "Email the patient when an appointment is booked, moved or cancelled. Only patients with an email on file receive messages.",
  },
  {
    key: "reminders",
    label: "Send reminders",
    help: "Email a reminder the day before and two hours before the visit.",
  },
];

/** How long the header's "Saved" mark stays after a change. */
const SAVED_MS = 2500;

/** Settings → Notifications: per-clinic switches. Owners change them; everyone else reads them. */
export function NotificationSettings({
  clinicId,
  initial,
  isOwner,
}: {
  clinicId: string;
  initial: Values;
  isOwner: boolean;
}) {
  const api = useApi();
  const { toast } = useToast();
  const [values, setValues] = useState<Values>(initial);
  const [busy, setBusy] = useState<Key | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function toggle(key: Key) {
    setBusy(key);
    setError(null);
    try {
      const r = await api<{ clinic: Pick<Clinic, "settings"> }>(
        `/v1/clinics/${encodeURIComponent(clinicId)}`,
        { method: "PATCH", body: { settings: { notifications: { [key]: !values[key] } } } },
      );
      setValues(clinicNotificationSettings(r.clinic.settings));
      setSaved(true);
      toast("Saved");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setSaved(false), SAVED_MS);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the setting");
    } finally {
      setBusy(null);
    }
  }

  return (
    <SettingsSection
      id="set-notifications"
      title="Notifications"
      aside={
        !isOwner ? (
          <OwnerOnlyNote />
        ) : saved ? (
          <span role="status" className="text-green-ink flex items-center gap-[6px] text-[12.5px]">
            <Check size={13} aria-hidden="true" />
            Saved
          </span>
        ) : null
      }
    >
      {ITEMS.map((i) => {
        const on = values[i.key];
        return (
          <div
            key={i.key}
            className="border-line-soft grid grid-cols-[minmax(0,1fr)_auto] items-center gap-[20px] border-t px-[20px] py-[16px]"
          >
            <div className="flex flex-col gap-[3px]">
              <span id={`ntf-set-${i.key}`} className="text-[14.5px] font-semibold">
                {i.label}
              </span>
              <span className="text-muted text-[13px] leading-[1.5]">{i.help}</span>
            </div>
            {isOwner ? (
              <Switch
                size={28}
                checked={on}
                disabled={busy !== null}
                onCheckedChange={() => void toggle(i.key)}
                aria-labelledby={`ntf-set-${i.key}`}
              />
            ) : (
              <span className="text-ink-2 text-[13.5px] font-medium">{on ? "On" : "Off"}</span>
            )}
          </div>
        );
      })}
      {error ? <SectionError>{error}</SectionError> : null}
    </SettingsSection>
  );
}
