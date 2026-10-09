"use client";

import { MailOpen } from "lucide-react";
import { useState } from "react";
import type { Notification, NotificationStatus } from "@muxaris/shared";
import { useApi } from "@/lib/api-client";
import { Button, ButtonLink, PageHeader, Tabs } from "@/components/ui";
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
  counts: initialCounts = {},
  tz,
  designsHref,
}: {
  initial: Notification[];
  initialTotal: number;
  /** Totals per status, so every tab shows its count before it is opened. */
  counts?: Partial<Record<NotificationStatus, number>>;
  tz: string;
  /** Where the "Email designs" button goes; the button is hidden without one. */
  designsHref?: string;
}) {
  const api = useApi();
  const [tab, setTab] = useState<Tab>("all");
  const [buckets, setBuckets] = useState<Partial<Record<Tab, Bucket>>>({
    all: { items: initial, total: initialTotal },
  });
  const [counts, setCounts] = useState<Partial<Record<Tab, number>>>(initialCounts);
  const [loading, setLoading] = useState<Partial<Record<Tab, boolean>>>({});
  const [errors, setErrors] = useState<Partial<Record<Tab, string>>>({});

  async function load(which: Tab, offset: number) {
    setLoading((p) => ({ ...p, [which]: true }));
    setErrors((p) => ({ ...p, [which]: undefined }));
    try {
      const qs = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
      if (which !== "all") qs.set("status", which);
      const r = await api<{ notifications: Notification[]; total: number }>(
        `/v1/notifications?${qs}`,
      );
      setBuckets((prev) => {
        const old = offset === 0 ? [] : (prev[which]?.items ?? []);
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
      const msg = e instanceof Error ? e.message : "Could not load messages";
      setErrors((p) => ({ ...p, [which]: msg }));
    } finally {
      setLoading((p) => ({ ...p, [which]: false }));
    }
  }

  function choose(next: Tab) {
    setTab(next);
    if (!buckets[next] && !loading[next]) void load(next, 0);
  }

  // Keyed off the row's new status, never the visible tab, so a late retry cannot hit the wrong bucket.
  function changed(updated: Notification) {
    const before = Object.values(buckets)
      .flatMap((b) => b?.items ?? [])
      .find((n) => n.id === updated.id)?.status;
    if (before && before !== updated.status) {
      setCounts((c) => ({
        ...c,
        ...(c[before] !== undefined ? { [before]: Math.max(0, c[before] - 1) } : {}),
        ...(c[updated.status] !== undefined ? { [updated.status]: c[updated.status]! + 1 } : {}),
      }));
    }
    setBuckets((prev) => {
      const next: Partial<Record<Tab, Bucket>> = {};
      for (const [key, b] of Object.entries(prev) as Array<[Tab, Bucket]>) {
        const has = b.items.some((n) => n.id === updated.id);
        if (key === "all") {
          next[key] = { ...b, items: b.items.map((n) => (n.id === updated.id ? updated : n)) };
        } else if (key === updated.status) {
          next[key] = has
            ? { ...b, items: b.items.map((n) => (n.id === updated.id ? updated : n)) }
            : { items: [updated, ...b.items], total: b.total + 1 };
        } else if (has) {
          next[key] = {
            items: b.items.filter((n) => n.id !== updated.id),
            total: Math.max(0, b.total - 1),
          };
        } else {
          next[key] = b;
        }
      }
      return next;
    });
  }

  const busy = loading[tab] === true;
  const error = errors[tab] ?? null;
  const bucket = buckets[tab];
  return (
    <div className="animate-mx-in flex flex-col gap-[18px] motion-reduce:animate-none">
      <PageHeader
        title="Notifications"
        subtitle="Confirmations and reminders go by email to patients with an email on file. SMS and WhatsApp are coming soon."
        maxWidth={640}
        className="max-sm:flex-wrap max-sm:[&_h1]:text-[22px]"
        actions={
          designsHref ? (
            <ButtonLink variant="secondary" size={36} icon={MailOpen} href={designsHref}>
              Email designs
            </ButtonLink>
          ) : null
        }
      />
      {/* Below 1024px the five tabs scroll sideways in their own strip instead of the page. */}
      <div data-tabs-scroll className="max-lg:overflow-x-auto">
        <Tabs
          aria-label="Status"
          value={tab}
          onChange={(id) => choose(id as Tab)}
          className="max-lg:w-max max-lg:min-w-full"
          items={TABS.map(([id, label]) => ({
            id,
            label,
            count: buckets[id]?.total ?? counts[id],
          }))}
        />
      </div>
      <div role="tabpanel" aria-label="Messages" className="flex flex-col gap-[18px]">
        {error ? (
          <p role="alert" className="text-rose m-0 text-[13.5px]">
            {error}{" "}
            <button
              type="button"
              className="cursor-pointer font-medium underline"
              onClick={() => load(tab, bucket?.items.length ?? 0)}
            >
              Retry
            </button>
          </p>
        ) : null}
        {bucket === undefined ? (
          error ? null : (
            <p className="text-muted m-0 text-[14px]" aria-live="polite">
              Loading…
            </p>
          )
        ) : (
          <NotificationsTable items={bucket.items} tz={tz} onChanged={changed} showPatientLink />
        )}
        {bucket && bucket.items.length < bucket.total ? (
          <Button
            variant="secondary"
            size={36}
            className="self-start"
            disabled={busy}
            onClick={() => load(tab, bucket.items.length)}
          >
            {busy ? "Loading…" : "Load more"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
