"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { clinicRecordCalls, type Clinic } from "@muxaris/shared";
import { Card, Switch, useToast } from "@/components/ui";
import { useApi } from "@/lib/api-client";

const HELP = "When off, calls are transcribed but no audio is kept.";
const SAVED_MS = 2500;

/**
 * Assistant → Record calls: the per-clinic recording switch, saved as soon as it changes.
 * Owners change it; everyone else sees On or Off.
 */
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
  const { toast } = useToast();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

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
      toast("Saved");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setSaved(false), SAVED_MS);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the setting");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      as="section"
      aria-labelledby="record-calls-label"
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-[20px] px-[20px] py-[18px]"
    >
      <div className="flex flex-col gap-[3px]">
        <span className="flex items-center gap-[10px]">
          <span id="record-calls-label" className="text-[14.5px] font-semibold">
            Record calls
          </span>
          {saved ? (
            <span
              role="status"
              className="text-green-ink flex items-center gap-[6px] text-[12.5px]"
            >
              <Check size={13} aria-hidden="true" />
              Saved
            </span>
          ) : null}
        </span>
        <span className="text-muted text-[13px]">{HELP}</span>
        {error ? (
          <span role="alert" className="text-rose text-[13px]">
            {error}
          </span>
        ) : null}
      </div>
      {isOwner ? (
        <Switch
          size={28}
          checked={on}
          disabled={busy}
          onCheckedChange={() => void toggle()}
          aria-labelledby="record-calls-label"
        />
      ) : (
        <span className="text-[13.5px] font-medium">{on ? "On" : "Off"}</span>
      )}
    </Card>
  );
}
