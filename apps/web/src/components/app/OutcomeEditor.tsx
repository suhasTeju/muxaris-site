"use client";

import { useState } from "react";
import { CALL_OUTCOMES, type Call } from "@muxaris/shared";
import { useApi } from "@/lib/api-client";
import { OUTCOME_LABEL } from "@/lib/dashboard";
import { Badge } from "./Badge";
import { fieldClass, primaryBtn } from "./Modal";

/** Staff correction of the outcome the assistant (or the analysis worker) assigned. */
export function OutcomeEditor({ call, onSaved }: { call: Call; onSaved: (call: Call) => void }) {
  const api = useApi();
  const [value, setValue] = useState<string>(call.outcome ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // A poll may bring a worker-set outcome: follow it unless the user is mid-edit.
  const [seen, setSeen] = useState(call.outcome);
  if (seen !== call.outcome) {
    if (value === (seen ?? "")) setValue(call.outcome ?? "");
    setSeen(call.outcome);
  }
  const changed = value !== "" && value !== call.outcome;

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const r = await api<{ call: Call }>(`/v1/calls/${encodeURIComponent(call.id)}`, {
        method: "PATCH",
        body: { outcome: value },
      });
      onSaved(r.call);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the outcome");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="outcome-h" className="border-line bg-surface rounded-card border p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 id="outcome-h" className="font-display text-lg">
          Call outcome
        </h2>
        {call.outcomeSource === "staff" ? <Badge tone="muted">Edited by staff</Badge> : null}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
          <span className="text-muted">Outcome</span>
          <select
            className={fieldClass}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setSaved(false);
            }}
          >
            {call.outcome === null ? (
              <option value="" disabled>
                Not set
              </option>
            ) : null}
            {CALL_OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {OUTCOME_LABEL[o]}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={primaryBtn} onClick={save} disabled={!changed || busy}>
          {busy ? "Saving…" : "Save outcome"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-danger mt-3 text-sm">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="text-muted mt-3 text-sm">
          Outcome saved.
        </p>
      ) : null}
    </section>
  );
}
