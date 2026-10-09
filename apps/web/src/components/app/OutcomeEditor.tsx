"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { CALL_OUTCOMES, type Call } from "@muxaris/shared";
import { Button, Card, Select, useToast } from "@/components/ui";
import { OUTCOME_LABEL } from "@/lib/dashboard";
import { useCoreApi } from "./core/api";

/**
 * Staff correction of the outcome the assistant (or the analysis worker) assigned. The "Edited by
 * staff" chip sits in the page header next to the outcome badge.
 */
export function OutcomeEditor({ call, onSaved }: { call: Call; onSaved: (call: Call) => void }) {
  const api = useCoreApi();
  const { toast } = useToast();
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
  // As before the redesign: Save needs a different outcome. Re-saving the shown one would flip its
  // source to staff and pin an outcome the worker set.
  const canSave = value !== "" && value !== call.outcome && !busy;

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
      toast("Outcome saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the outcome");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card aria-labelledby="outcome-h" className="flex flex-col gap-[12px] p-[18px]">
      <h2 id="outcome-h" className="m-0 text-[15px] font-semibold">
        Call outcome
      </h2>
      <div className="flex gap-[8px]">
        <label className="flex min-w-0 flex-1">
          <span className="sr-only">Outcome</span>
          <Select
            size={38}
            className="flex-1"
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
          </Select>
        </label>
        <Button
          size={38}
          className="rounded-9 text-[13.5px] shadow-none"
          onClick={save}
          disabled={!canSave}
        >
          {busy ? "Saving…" : "Save outcome"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-rose m-0 text-[13px]">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="text-green-ink m-0 flex items-center gap-[6px] text-[13px]">
          <Check size={13} aria-hidden />
          Outcome saved.
        </p>
      ) : null}
    </Card>
  );
}
