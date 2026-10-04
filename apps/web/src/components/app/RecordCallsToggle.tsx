"use client";

import { useState } from "react";
import { clinicRecordCalls, type Clinic } from "@muxaris/shared";
import { useApi } from "@/lib/api-client";

const HELP = "When off, calls are transcribed but no audio is kept.";

/** Per-clinic recording switch. Owners can change it; everyone else sees the current state. */
export function RecordCallsToggle({
  clinicId,
  initial,
  isOwner,
}: {
  clinicId: string;
  initial: boolean;
  isOwner: boolean;
}) {
  const api = useApi();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !on;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const r = await api<{ clinic: Pick<Clinic, "settings"> }>(
        `/v1/clinics/${encodeURIComponent(clinicId)}`,
        { method: "PATCH", body: { settings: { recordCalls: next } } },
      );
      setOn(clinicRecordCalls(r.clinic.settings));
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the setting");
    } finally {
      setBusy(false);
    }
  }

  if (!isOwner) {
    return (
      <div className="text-[15px]">
        <p>
          <span className="text-muted">Record calls: </span>
          {on ? "On" : "Off"}
        </p>
        <p className="text-muted text-sm">{HELP} Only the clinic owner can change this.</p>
      </div>
    );
  }

  return (
    <div className="text-[15px]">
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="record-calls-label"
          disabled={busy}
          onClick={toggle}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-60 ${on ? "bg-[var(--color-accent)]" : "bg-[var(--color-line)]"}`}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-6" : "translate-x-1"}`}
          />
        </button>
        <span id="record-calls-label" className="font-medium">
          Record calls
        </span>
        {saved ? (
          <span role="status" className="text-muted text-sm">
            Saved
          </span>
        ) : null}
      </div>
      <p className="text-muted mt-1 text-sm">{HELP}</p>
      {error ? (
        <p role="alert" className="mt-1 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
