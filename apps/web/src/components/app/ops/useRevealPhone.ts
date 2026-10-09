"use client";

import { useEffect, useState } from "react";
import { useApi } from "@/lib/api-client";

/** How long a revealed number stays on screen. */
export const REVEAL_MS = 60_000;

/**
 * The audited "Show number" reveal (POST to the row's reveal-phone endpoint), as a hook so a card
 * can place the number, the button and the "Visible for 60 seconds" note where the design puts
 * them. The number hides itself again after a minute.
 */
export function useRevealPhone(path: string) {
  const api = useApi();
  const [phone, setPhone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!phone) return;
    const t = setTimeout(() => setPhone(null), REVEAL_MS);
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

  return { phone, busy, error, reveal };
}
