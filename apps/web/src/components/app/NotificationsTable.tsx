"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { NOTIFICATION_KIND_LABEL, type Notification } from "@muxaris/shared";
import { useApi } from "@/lib/api-client";
import { CHANNEL_LABEL, formatDateTime, notificationErrorText } from "@/lib/dashboard";
import { NotificationStatusBadge } from "./Badge";
import { EmptyState } from "./EmptyState";
import { ghostBtn } from "./Modal";

function Row({
  n,
  tz,
  showPatientLink,
  onChanged,
}: {
  n: Notification;
  tz: string;
  showPatientLink: boolean;
  onChanged: (n: Notification) => void;
}) {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Superseded rows were replaced by a later message; the API refuses to retry them.
  const retryable = (n.status === "failed" || n.status === "skipped") && n.error !== "superseded";

  async function retry() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ notification: Notification }>(
        `/v1/notifications/${encodeURIComponent(n.id)}/retry`,
        { method: "POST" },
      );
      onChanged(r.notification);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not retry the message");
    } finally {
      setBusy(false);
    }
  }

  const panelId = `ntf-msg-${n.id}`;
  return (
    <Fragment>
      <tr className="border-line border-t align-top">
        <td className="px-3 py-3 whitespace-nowrap">{formatDateTime(n.createdAt, tz)}</td>
        <td className="px-3 py-3">{NOTIFICATION_KIND_LABEL[n.template]}</td>
        <td className="px-3 py-3">{CHANNEL_LABEL[n.channel]}</td>
        <td className="px-3 py-3 tabular-nums">{n.toMasked || "—"}</td>
        <td className="px-3 py-3">
          <NotificationStatusBadge status={n.status} />
        </td>
        <td className="text-muted px-3 py-3 text-sm">{notificationErrorText(n)}</td>
        <td className="px-3 py-3">
          <span className="flex flex-wrap gap-2">
            <button
              type="button"
              className={ghostBtn}
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? "Hide message" : "View message"}
            </button>
            {retryable ? (
              <button type="button" className={ghostBtn} disabled={busy} onClick={retry}>
                Retry
              </button>
            ) : null}
            {showPatientLink && n.patientId ? (
              <Link
                href={`/app/patients/${n.patientId}`}
                className="text-accent-deep inline-flex min-h-11 items-center text-sm underline-offset-4 hover:underline"
              >
                Patient
              </Link>
            ) : null}
          </span>
        </td>
      </tr>
      {open ? (
        <tr id={panelId}>
          <td colSpan={7} className="bg-[color-mix(in_srgb,var(--color-ink)_3%,white)] px-4 py-3">
            {n.payload.subject ? <p className="font-semibold">{n.payload.subject}</p> : null}
            <p className="text-[15px] whitespace-pre-wrap">
              {n.payload.body ?? "No message body."}
            </p>
          </td>
        </tr>
      ) : null}
      {error ? (
        <tr>
          <td colSpan={7} className="px-3 pb-3">
            <p role="alert" className="text-danger text-sm">
              {error}
            </p>
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

/** Outbox rows with a readable status, an expandable message and retry for failed or skipped sends. */
export function NotificationsTable({
  items,
  tz,
  onChanged,
  showPatientLink = false,
}: {
  items: Notification[];
  tz: string;
  onChanged: (n: Notification) => void;
  showPatientLink?: boolean;
}) {
  if (items.length === 0) {
    return (
      <EmptyState>
        No messages yet. Confirmations appear here when an appointment is booked.
      </EmptyState>
    );
  }
  return (
    <div className="border-line bg-surface rounded-card overflow-x-auto border">
      <table className="w-full text-left text-[15px]">
        <thead className="text-muted text-sm">
          <tr>
            {["Time", "Type", "Channel", "To", "Status", "Details", ""].map((h, i) => (
              <th key={i} scope="col" className="px-3 py-2 font-normal">
                {h || <span className="sr-only">Actions</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((n) => (
            <Row key={n.id} n={n} tz={tz} showPatientLink={showPatientLink} onChanged={onChanged} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
