"use client";

import { useState } from "react";
import { clinicNotificationSettings, type Clinic } from "@muxaris/shared";
import { useApi } from "@/lib/api-client";

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

/** Per-clinic notification switches. Owners can change them; everyone else sees the current state. */
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
  const [values, setValues] = useState<Values>(initial);
  const [busy, setBusy] = useState<Key | null>(null);
  const [saved, setSaved] = useState<Key | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(key: Key) {
    setBusy(key);
    setError(null);
    setSaved(null);
    try {
      const r = await api<{ clinic: Pick<Clinic, "settings"> }>(
        `/v1/clinics/${encodeURIComponent(clinicId)}`,
        { method: "PATCH", body: { settings: { notifications: { [key]: !values[key] } } } },
      );
      setValues(clinicNotificationSettings(r.clinic.settings));
      setSaved(key);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the setting");
    } finally {
      setBusy(null);
    }
  }

  if (!isOwner) {
    return (
      <div className="text-[15px]">
        {ITEMS.map((i) => (
          <p key={i.key}>
            <span className="text-muted">{i.label}: </span>
            {values[i.key] ? "On" : "Off"}
          </p>
        ))}
        <p className="text-muted text-sm">Only the clinic owner can change this.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 text-[15px]">
      {ITEMS.map((i) => {
        const on = values[i.key];
        return (
          <div key={i.key}>
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-labelledby={`ntf-set-${i.key}`}
                disabled={busy !== null}
                onClick={() => toggle(i.key)}
                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-60 ${on ? "bg-[var(--color-accent)]" : "bg-[var(--color-line)]"}`}
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-6" : "translate-x-1"}`}
                />
              </button>
              <span id={`ntf-set-${i.key}`} className="font-medium">
                {i.label}
              </span>
              {saved === i.key ? (
                <span role="status" className="text-muted text-sm">
                  Saved
                </span>
              ) : null}
            </div>
            <p className="text-muted mt-1 text-sm">{i.help}</p>
          </div>
        );
      })}
      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
