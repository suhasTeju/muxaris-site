"use client";

import { useState } from "react";
import type { Notification, NotificationStatus } from "@muxaris/shared";
import { useApi } from "@/lib/api-client";
import { ghostBtn } from "./Modal";
import { NotificationsTable } from "./NotificationsTable";

const PAGE = 50;
type Tab = "all" | NotificationStatus;
interface Bucket {
  items: Notification[];
  total: number;
}

const TABS: Array<[Tab, string]> = [
  ["all", "All"],
  ["queued", "Queued"],
  ["sent", "Sent"],
  ["failed", "Failed"],
  ["skipped", "Not sent"],
];

/** Outbox with a status filter. The server renders "All"; other tabs load on first visit. */
export function NotificationsView({
  initial,
  initialTotal,
  tz,
}: {
  initial: Notification[];
  initialTotal: number;
  tz: string;
}) {
  const api = useApi();
  const [tab, setTab] = useState<Tab>("all");
  const [buckets, setBuckets] = useState<Partial<Record<Tab, Bucket>>>({
    all: { items: initial, total: initialTotal },
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(which: Tab, offset: number) {
    setBusy(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
      if (which !== "all") qs.set("status", which);
      const r = await api<{ notifications: Notification[]; total: number }>(
        `/v1/notifications?${qs}`,
      );
      setBuckets((prev) => {
        const old = prev[which]?.items ?? [];
        const seen = new Set(old.map((n) => n.id));
        return {
          ...prev,
          [which]: {
            items: [...old, ...r.notifications.filter((n) => !seen.has(n.id))],
            total: r.total,
          },
        };
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load messages");
    } finally {
      setBusy(false);
    }
  }

  function choose(next: Tab) {
    setTab(next);
    if (!buckets[next] && !busy) void load(next, 0);
  }

  function changed(updated: Notification) {
    // The row may belong in a different status bucket now; drop the other loaded buckets so they refetch.
    setBuckets((prev) => {
      const next: Partial<Record<Tab, Bucket>> = {};
      if (prev.all) {
        next.all = {
          ...prev.all,
          items: prev.all.items.map((n) => (n.id === updated.id ? updated : n)),
        };
      }
      const cur = prev[tab];
      if (tab !== "all" && cur) {
        const items = cur.items.filter((n) => n.id !== updated.id);
        next[tab] = { items, total: Math.max(0, cur.total - (cur.items.length - items.length)) };
      }
      return next;
    });
  }

  const bucket = buckets[tab];
  return (
    <div>
      <div role="tablist" aria-label="Message status" className="mb-4 flex flex-wrap gap-2">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`ntf-tab-${key}`}
            aria-selected={tab === key}
            aria-controls="ntf-panel"
            onClick={() => choose(key)}
            className={`min-h-11 rounded-xl px-4 text-[15px] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] ${
              tab === key ? "bg-accent text-on-accent" : "border-line text-muted border"
            }`}
          >
            {label}
            {buckets[key] ? (
              <span className="ml-1.5 tabular-nums">({buckets[key].total})</span>
            ) : null}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="ntf-panel" aria-labelledby={`ntf-tab-${tab}`}>
        {error ? (
          <p role="alert" className="text-danger mb-3 text-sm">
            {error}{" "}
            <button
              type="button"
              className="underline"
              onClick={() => load(tab, bucket?.items.length ?? 0)}
            >
              Retry
            </button>
          </p>
        ) : null}
        {bucket === undefined ? (
          <p className="text-muted" aria-live="polite">
            {error ? null : "Loading…"}
          </p>
        ) : (
          <NotificationsTable items={bucket.items} tz={tz} onChanged={changed} showPatientLink />
        )}
        {bucket && bucket.items.length < bucket.total ? (
          <button
            type="button"
            className={`${ghostBtn} mt-4`}
            disabled={busy}
            onClick={() => load(tab, bucket.items.length)}
          >
            {busy ? "Loading…" : "Load more"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
