"use client";

import Link from "next/link";
import { useState } from "react";
import type { Callback } from "@muxaris/shared";
import { useApi } from "@/lib/api-client";
import { formatDateTime } from "@/lib/dashboard";
import { Badge } from "./Badge";
import { EmptyState } from "./EmptyState";
import { fieldClass, ghostBtn, primaryBtn } from "./Modal";
import { RevealPhone } from "./RevealPhone";

const PAGE = 50;
type Tab = "open" | "done";
interface Bucket {
  items: Callback[];
  total: number;
}

function Row({
  cb,
  tz,
  onChanged,
}: {
  cb: Callback;
  tz: string;
  onChanged: (updated: Callback) => void;
}) {
  const api = useApi();
  const [note, setNote] = useState(cb.note ?? "");
  const [assignee, setAssignee] = useState(cb.assignedTo ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = cb.status === "open";

  const body: Record<string, unknown> = {};
  if (assignee.trim() !== (cb.assignedTo ?? "")) body.assignedTo = assignee.trim() || null;
  if (note.trim() !== (cb.note ?? "")) body.note = note.trim();
  const dirty = Object.keys(body).length > 0;

  async function patch(payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ callback: Callback }>(`/v1/callbacks/${encodeURIComponent(cb.id)}`, {
        method: "PATCH",
        body: payload,
      });
      onChanged(r.callback);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the callback");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-3 px-4 py-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <RevealPhone
          masked={cb.phoneMasked}
          path={`/v1/callbacks/${encodeURIComponent(cb.id)}/reveal-phone`}
        />
        <Badge tone={cb.priority === "high" || cb.priority === "urgent" ? "warn" : "muted"}>
          {cb.priority}
        </Badge>
        <span className="text-muted text-sm">{formatDateTime(cb.createdAt, tz)}</span>
        {cb.callId ? (
          <Link
            href={`/app/calls/${cb.callId}`}
            className="text-accent-deep ml-auto text-sm underline-offset-4 hover:underline"
          >
            View call
          </Link>
        ) : null}
      </div>
      <p className="text-[15px]">{cb.reason}</p>
      {open ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
            <span className="text-muted">Assigned to</span>
            <input
              className={fieldClass}
              value={assignee}
              maxLength={64}
              onChange={(e) => setAssignee(e.target.value)}
            />
          </label>
          <label className="flex min-w-56 flex-[2] flex-col gap-1 text-sm">
            <span className="text-muted">Note</span>
            <input
              className={fieldClass}
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          {dirty ? (
            <button type="button" className={ghostBtn} disabled={busy} onClick={() => patch(body)}>
              Save details
            </button>
          ) : null}
          <button
            type="button"
            className={primaryBtn}
            disabled={busy}
            onClick={() => patch({ status: "done", ...body })}
          >
            Mark done
          </button>
        </div>
      ) : (
        <div className="text-muted flex flex-wrap gap-x-4 text-sm">
          {cb.doneAt ? <span>Done {formatDateTime(cb.doneAt, tz)}</span> : null}
          {cb.assignedTo ? <span>Assigned to {cb.assignedTo}</span> : null}
          {cb.note ? <span className="text-[var(--color-ink)]">{cb.note}</span> : null}
        </div>
      )}
      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}
    </li>
  );
}

/** Open/done callbacks. The server renders the open page; Done loads on first visit. */
export function CallbacksQueue({
  initial,
  initialTotal,
  tz,
}: {
  initial: Callback[];
  initialTotal: number;
  tz: string;
}) {
  const api = useApi();
  const [tab, setTab] = useState<Tab>("open");
  const [open, setOpen] = useState<Bucket>({ items: initial, total: initialTotal });
  const [done, setDone] = useState<Bucket | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(which: Tab, offset: number) {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ callbacks: Callback[]; total: number }>(
        `/v1/callbacks?${new URLSearchParams({ status: which, limit: String(PAGE), offset: String(offset) })}`,
      );
      const merge = (prev: Bucket | null): Bucket => {
        const seen = new Set((prev?.items ?? []).map((c) => c.id));
        return {
          items: [...(prev?.items ?? []), ...r.callbacks.filter((c) => !seen.has(c.id))],
          total: r.total,
        };
      };
      if (which === "open") setOpen(merge);
      else setDone(merge);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load callbacks");
    } finally {
      setBusy(false);
    }
  }

  function choose(next: Tab) {
    setTab(next);
    if (next === "done" && done === null && !busy) void load("done", 0);
  }

  function changed(updated: Callback) {
    if (updated.status === "done") {
      setOpen((b) => ({
        items: b.items.filter((c) => c.id !== updated.id),
        total: Math.max(0, b.total - 1),
      }));
      setDone((b) =>
        b
          ? { items: [updated, ...b.items.filter((c) => c.id !== updated.id)], total: b.total + 1 }
          : b,
      );
    } else {
      setOpen((b) => ({
        ...b,
        items: b.items.map((c) => (c.id === updated.id ? updated : c)),
      }));
    }
  }

  const bucket = tab === "open" ? open : done;
  const tabs: Array<[Tab, string, number | null]> = [
    ["open", "Open", open.total],
    ["done", "Done", done?.total ?? null],
  ];

  return (
    <div>
      <div role="tablist" aria-label="Callback status" className="mb-4 flex gap-2">
        {tabs.map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`cb-tab-${key}`}
            aria-selected={tab === key}
            aria-controls="cb-panel"
            onClick={() => choose(key)}
            className={`min-h-11 rounded-xl px-4 text-[15px] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] ${
              tab === key ? "bg-accent text-on-accent" : "border-line text-muted border"
            }`}
          >
            {label}
            {count !== null ? <span className="ml-1.5 tabular-nums">({count})</span> : null}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="cb-panel" aria-labelledby={`cb-tab-${tab}`}>
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
        {bucket === null ? (
          <p className="text-muted" aria-live="polite">
            {error ? null : "Loading…"}
          </p>
        ) : bucket.items.length === 0 ? (
          <EmptyState>
            {tab === "open"
              ? "Nothing waiting. When a caller asks for a callback it appears here."
              : "No completed callbacks yet."}
          </EmptyState>
        ) : (
          <ul className="border-line bg-surface divide-line divide-y rounded-card border">
            {bucket.items.map((cb) => (
              <Row key={cb.id} cb={cb} tz={tz} onChanged={changed} />
            ))}
          </ul>
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
