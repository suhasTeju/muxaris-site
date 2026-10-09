"use client";

import { useState } from "react";
import { NOTIFICATION_KIND_LABEL, type Notification } from "@muxaris/shared";
import { Button, useToast } from "@/components/ui";
import { CHANNEL_LABEL, formatTime, notificationErrorText } from "@/lib/dashboard";
import { useCoreApi } from "../core/api";
import { StatusBadge } from "../core/StatusBadge";
import { formatDayShort } from "../core/format";

/**
 * One message on the patient page: when, kind and channel, the masked recipient, why it was not
 * sent, its status, the message itself on demand, and Retry for failed or skipped sends (the same
 * actions as the outbox on /app/notifications).
 */
export function MessageRow({
  n,
  tz,
  rowClass,
  whenClass,
  onChanged,
}: {
  n: Notification;
  tz: string;
  /** The section's row grid (shared with Visits and Calls). */
  rowClass: string;
  whenClass: string;
  onChanged: (n: Notification) => void;
}) {
  const api = useCoreApi();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Superseded rows were replaced by a later message; the API refuses to retry them.
  const retryable = (n.status === "failed" || n.status === "skipped") && n.error !== "superseded";
  const why = notificationErrorText(n);
  const panelId = `pd-msg-${n.id}`;

  async function retry() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ notification: Notification }>(
        `/v1/notifications/${encodeURIComponent(n.id)}/retry`,
        { method: "POST" },
      );
      onChanged(r.notification);
      if (r.notification.status === "queued") toast("Message queued again");
      else
        toast(
          `Not sent: ${notificationErrorText(r.notification) || "no way to reach the patient"}`,
          { tone: "bad" },
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not retry the message");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li>
      <div className={rowClass}>
        <span className={whenClass}>
          {formatDayShort(n.createdAt, tz)}, {formatTime(n.createdAt, tz)}
        </span>
        <span className="flex min-w-0 flex-col gap-[2px]">
          <span>
            {NOTIFICATION_KIND_LABEL[n.template] ?? n.template}{" "}
            <span className="text-muted">· {CHANNEL_LABEL[n.channel] ?? n.channel}</span>
          </span>
          <span className="text-muted truncate font-mono text-[12px]">
            <span className="sr-only">To </span>
            {n.toMasked || "—"}
          </span>
          {why ? <span className="text-muted text-[12.5px]">{why}</span> : null}
        </span>
        <span className="flex flex-wrap items-center justify-end gap-[6px] max-sm:col-span-full max-sm:justify-start">
          <StatusBadge kind="notif" value={n.status} />
          <Button
            variant="ghost-teal"
            size={28}
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Hide message" : "View message"}
          </Button>
          {retryable ? (
            <Button variant="secondary" size={28} disabled={busy} onClick={retry}>
              {busy ? "Retrying…" : "Retry"}
            </Button>
          ) : null}
        </span>
      </div>
      {open ? (
        <div
          id={panelId}
          className="border-chip bg-subtle mx-[18px] mb-[14px] flex flex-col gap-[6px] rounded-12 border px-[16px] py-[14px]"
        >
          {n.payload.subject ? (
            <span className="text-[14px] font-semibold">{n.payload.subject}</span>
          ) : null}
          <p className="text-ink-2 m-0 text-[14px] leading-[1.6] whitespace-pre-line">
            {n.payload.body ?? "No message body."}
          </p>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-rose m-0 px-[18px] pb-[12px] text-[13px]">
          {error}
        </p>
      ) : null}
    </li>
  );
}
