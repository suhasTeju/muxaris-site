"use client";

import { useEffect, useRef, useState } from "react";
import { Eye } from "lucide-react";
import { Button, cn } from "@/components/ui";
import { useCoreApi } from "./core/api";
import { formatPhone } from "./core/format";

const SHOW_MS = 60_000;
export const REVEAL_NOTE = "Visible for 60 seconds. This view is logged.";

/**
 * Masked phone with an audited "Show number" reveal that hides itself again after a minute
 * (the patient card and appointment drawer in the design). The number is Geist Mono 13.5px; pass
 * `numberClassName` to restyle it, and `note={false}` to place the "Visible for 60 seconds" line
 * yourself via `onRevealed`.
 */
export function RevealPhone({
  masked,
  path,
  numberClassName,
  note = true,
  onRevealed,
  className,
}: {
  masked: string;
  path: string;
  numberClassName?: string;
  note?: boolean;
  onRevealed?: (revealed: boolean) => void;
  className?: string;
}) {
  const api = useCoreApi();
  const [phone, setPhone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notify = useRef(onRevealed);
  useEffect(() => {
    notify.current = onRevealed;
  });

  useEffect(() => {
    if (!phone) return;
    const t = setTimeout(() => {
      setPhone(null);
      notify.current?.(false);
    }, SHOW_MS);
    return () => clearTimeout(t);
  }, [phone]);

  async function reveal() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ phone: string }>(path, { method: "POST" });
      setPhone(r.phone);
      notify.current?.(true);
    } catch (e) {
      const status = (e as { status?: number }).status;
      setError(
        status === 409
          ? "This number was purged after 90 days and is no longer available."
          : e instanceof Error
            ? e.message
            : "Could not show the number",
      );
    } finally {
      setBusy(false);
    }
  }

  const number = cn("font-mono text-[13.5px]", numberClassName);
  return (
    <span className={cn("flex flex-col gap-[4px]", className)}>
      <span className="flex flex-wrap items-center gap-[10px]">
        {phone ? (
          <a href={`tel:${phone}`} className={cn(number, "text-ink hover:text-ink")}>
            {formatPhone(phone)}
          </a>
        ) : (
          <span className={number}>{masked}</span>
        )}
        {!phone ? (
          <Button variant="secondary" size={26} icon={Eye} disabled={busy} onClick={reveal}>
            Show number
          </Button>
        ) : null}
      </span>
      {phone && note ? <span className="text-muted text-[12px]">{REVEAL_NOTE}</span> : null}
      {error ? (
        <span role="alert" className="text-rose text-[12px]">
          {error}
        </span>
      ) : null}
    </span>
  );
}
