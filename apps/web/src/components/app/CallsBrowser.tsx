"use client";

import { useState } from "react";
import type { Call } from "@muxaris/shared";
import { useApi } from "@/lib/api-client";
import { CALLS_PAGE_SIZE } from "@/lib/dashboard";
import { CallList } from "./CallList";
import { ghostBtn } from "./Modal";

/** First page comes from the server; "Load more" pages through GET /v1/calls by offset. */
export function CallsBrowser({
  initial,
  tz,
  filters = {},
}: {
  initial: Call[];
  tz: string;
  /** API query params (ISO from/to already resolved); also used for every "Load more" page. */
  filters?: Record<string, string>;
}) {
  const api = useApi();
  const [calls, setCalls] = useState(initial);
  const [done, setDone] = useState(initial.length < CALLS_PAGE_SIZE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function more() {
    setBusy(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        ...filters,
        limit: String(CALLS_PAGE_SIZE),
        offset: String(calls.length),
      });
      const r = await api<{ calls: Call[] }>(`/v1/calls?${q}`);
      setCalls((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...r.calls.filter((c) => !seen.has(c.id))];
      });
      if (r.calls.length < CALLS_PAGE_SIZE) setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load more calls");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <CallList calls={calls} tz={tz} filtered={Object.keys(filters).length > 0} />
      {error ? (
        <p role="alert" className="text-danger mt-3 text-sm">
          {error}
        </p>
      ) : null}
      {!done ? (
        <button type="button" className={`${ghostBtn} mt-4`} onClick={more} disabled={busy}>
          {busy ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </>
  );
}
