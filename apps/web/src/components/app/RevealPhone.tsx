"use client";

import { useEffect, useState } from "react";
import { useApi } from "@/lib/api-client";
import { ghostBtn } from "./Modal";

const SHOW_MS = 60_000;

/** Masked phone with an audited "Show number" reveal that hides itself again after a minute. */
export function RevealPhone({ masked, path }: { masked: string; path: string }) {
  const api = useApi();
  const [phone, setPhone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!phone) return;
    const t = setTimeout(() => setPhone(null), SHOW_MS);
    return () => clearTimeout(t);
  }, [phone]);

  async function reveal() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ phone: string }>(path, { method: "POST" });
      setPhone(r.phone);
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

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {phone ? (
        <a href={`tel:${phone}`} className="font-medium tabular-nums underline">
          {phone}
        </a>
      ) : (
        <span className="font-medium tabular-nums">{masked}</span>
      )}
      {!phone ? (
        <button type="button" className={ghostBtn} disabled={busy} onClick={reveal}>
          Show number
        </button>
      ) : null}
      {error ? (
        <span role="alert" className="text-danger text-sm">
          {error}
        </span>
      ) : null}
    </span>
  );
}
