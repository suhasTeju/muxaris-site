"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Check, CircleCheck, Eye } from "lucide-react";
import { useState } from "react";
import type { Callback } from "@muxaris/shared";
import { useApi } from "@/lib/api-client";
import { localDateKey } from "@/lib/dashboard";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Tabs,
  badgeFor,
  cn,
  useToast,
} from "@/components/ui";
import { callbackWhen, displayPhone } from "./ops/format";
import { useRevealPhone } from "./ops/useRevealPhone";

const PAGE = 50;
type Tab = "open" | "done";
interface Bucket {
  items: Callback[];
  total: number;
}

/** The design lists open callbacks urgent → high → normal, newest first within a priority. */
const RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2 };
const rank = (p: string) => RANK[p] ?? 3;

function sortFor(tab: Tab, items: Callback[]): Callback[] {
  const list = [...items];
  if (tab === "open")
    return list.sort(
      (a, b) => rank(a.priority) - rank(b.priority) || b.createdAt.localeCompare(a.createdAt),
    );
  return list.sort((a, b) => (b.doneAt ?? b.createdAt).localeCompare(a.doneAt ?? a.createdAt));
}

function CallbackCard({
  cb,
  tz,
  today,
  onChanged,
}: {
  cb: Callback;
  tz: string;
  today: string;
  onChanged: (updated: Callback) => void;
}) {
  const api = useApi();
  const { toast } = useToast();
  const reveal = useRevealPhone(`/v1/callbacks/${encodeURIComponent(cb.id)}/reveal-phone`);
  const [note, setNote] = useState(cb.note ?? "");
  const [assignee, setAssignee] = useState(cb.assignedTo ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = cb.status === "open";
  const urgent = open && cb.priority === "urgent";
  const priority = badgeFor("priority", cb.priority);

  const body: Record<string, unknown> = {};
  if (assignee.trim() !== (cb.assignedTo ?? "")) body.assignedTo = assignee.trim() || null;
  if (note.trim() !== (cb.note ?? "")) body.note = note.trim();
  const dirty = Object.keys(body).length > 0;

  async function patch(payload: Record<string, unknown>, done: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ callback: Callback }>(`/v1/callbacks/${encodeURIComponent(cb.id)}`, {
        method: "PATCH",
        body: payload,
      });
      onChanged(r.callback);
      toast(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the callback");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      as="article"
      className={cn(
        "animate-mx-in flex flex-col gap-[14px] p-[18px]",
        urgent && "border-rose-line shadow-[0_0_0_3px_rgba(224,72,112,0.08)]",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-[12px]">
        <div className="flex flex-wrap items-center gap-[10px]">
          {reveal.phone ? (
            <a
              href={`tel:${reveal.phone}`}
              className="text-ink hover:text-ink font-mono text-[14px] font-medium"
            >
              {displayPhone(reveal.phone)}
            </a>
          ) : (
            <span className="font-mono text-[14px] font-medium">{cb.phoneMasked}</span>
          )}
          {!reveal.phone ? (
            <Button
              variant="secondary"
              size={26}
              icon={Eye}
              disabled={reveal.busy}
              onClick={reveal.reveal}
            >
              Show number
            </Button>
          ) : null}
          {open ? (
            <Badge tone={priority.tone} className="font-semibold">
              {priority.label}
            </Badge>
          ) : null}
        </div>
        <div className="text-muted flex items-center gap-[14px] text-[13px]">
          <span className="font-mono text-[12.5px]">{callbackWhen(cb.createdAt, tz, today)}</span>
          {cb.callId ? (
            <Link
              href={`/app/calls/${cb.callId}`}
              className="inline-flex items-center gap-[5px] font-medium"
            >
              View call
              <ArrowUpRight size={13} aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      </div>
      <p className="text-ink m-0 text-[15px] leading-[1.55]">{cb.reason}</p>
      {reveal.phone ? (
        <span className="text-muted -mt-[8px] text-[12px]">
          Visible for 60 seconds. This view is logged.
        </span>
      ) : null}
      {reveal.error ? (
        <p role="alert" className="text-rose m-0 -mt-[8px] text-[12px]">
          {reveal.error}
        </p>
      ) : null}
      {open ? (
        <div className="border-chip grid grid-cols-1 items-end gap-[10px] border-t pt-[14px] md:grid-cols-[200px_minmax(0,1fr)_auto]">
          <Field label="Assigned to" variant="muted">
            <Input
              size={38}
              value={assignee}
              maxLength={64}
              placeholder="Name"
              onChange={(e) => setAssignee(e.target.value)}
            />
          </Field>
          <Field label="Note" variant="muted">
            <Input
              size={38}
              value={note}
              maxLength={500}
              placeholder="What was agreed"
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <div className="flex gap-[8px]">
            {dirty ? (
              <Button
                variant="secondary"
                size={38}
                className="rounded-9 px-[12px] text-[13.5px]"
                disabled={busy}
                onClick={() => patch(body, "Details saved")}
              >
                Save details
              </Button>
            ) : null}
            <Button
              size={38}
              icon={Check}
              iconSize={14}
              className="rounded-9 gap-[6px] text-[13.5px] shadow-none"
              disabled={busy}
              onClick={() => patch({ status: "done", ...body }, "Callback marked done")}
            >
              Mark done
            </Button>
          </div>
        </div>
      ) : (
        <div className="border-chip text-ink-2 flex flex-wrap gap-[18px] border-t pt-[12px] text-[13.5px]">
          {cb.doneAt ? (
            <span className="text-green-ink flex items-center gap-[6px]">
              <CircleCheck size={14} aria-hidden="true" />
              Done {callbackWhen(cb.doneAt, tz, today)}
            </span>
          ) : null}
          {cb.assignedTo ? <span>Assigned to {cb.assignedTo}</span> : null}
          {cb.note ? <span className="text-muted">{cb.note}</span> : null}
        </div>
      )}
      {error ? (
        <p role="alert" className="text-rose m-0 text-[13px]">
          {error}
        </p>
      ) : null}
    </Card>
  );
}

/**
 * Open and done callbacks. The server renders both first pages so each tab shows its count;
 * if the done page could not be loaded it loads on first visit.
 */
export function CallbacksQueue({
  initial,
  initialTotal,
  initialDone,
  initialTab = "open",
  tz,
  today: todayProp,
}: {
  initial: Callback[];
  initialTotal: number;
  /** First page of done callbacks, when the server could load it. */
  initialDone?: Bucket;
  initialTab?: Tab;
  tz: string;
  /** Clinic-local "YYYY-MM-DD" that reads as "Today"; the server page passes it. */
  today?: string;
}) {
  const api = useApi();
  const router = useRouter();
  const [today] = useState(() => todayProp ?? localDateKey(new Date(), tz));
  const [tab, setTab] = useState<Tab>(initialTab);
  const [open, setOpen] = useState<Bucket>({ items: initial, total: initialTotal });
  const [done, setDone] = useState<Bucket | null>(initialDone ?? null);
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
      // The sidebar's open-callbacks badge comes from the layout.
      router.refresh();
    } else {
      setOpen((b) => ({
        ...b,
        items: b.items.map((c) => (c.id === updated.id ? updated : c)),
      }));
    }
  }

  const bucket = tab === "open" ? open : done;
  return (
    <div className="animate-mx-in flex max-w-[980px] flex-col gap-[18px]">
      <PageHeader title="Callbacks" className="max-sm:flex-wrap max-sm:[&_h1]:text-[22px]" />
      <Tabs
        aria-label="Callback status"
        value={tab}
        onChange={(id) => choose(id as Tab)}
        items={[
          { id: "open", label: `Open (${open.total})` },
          { id: "done", label: done ? `Done (${done.total})` : "Done" },
        ]}
      />
      <div role="tabpanel" aria-label={tab === "open" ? "Open callbacks" : "Done callbacks"}>
        <div className="flex flex-col gap-[18px]">
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
          {bucket === null ? (
            error ? null : (
              <p className="text-muted m-0 text-[14px]" aria-live="polite">
                Loading…
              </p>
            )
          ) : bucket.items.length === 0 ? (
            <EmptyState size="sm">
              {tab === "open"
                ? "Nothing waiting. When a caller asks for a callback it appears here."
                : "No completed callbacks yet."}
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-[10px]">
              {sortFor(tab, bucket.items).map((cb) => (
                <CallbackCard key={cb.id} cb={cb} tz={tz} today={today} onChanged={changed} />
              ))}
            </div>
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
    </div>
  );
}
