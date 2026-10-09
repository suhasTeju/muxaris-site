"use client";

import { Mail, MessageCircle, MessageSquare, type LucideIcon } from "lucide-react";
import { Fragment, useState } from "react";
import { NOTIFICATION_KIND_LABEL, type Notification } from "@muxaris/shared";
import { useApi } from "@/lib/api-client";
import { CHANNEL_LABEL, notificationErrorText } from "@/lib/dashboard";
import { Badge, Button, ButtonLink, Card, EmptyState, badgeFor, useToast } from "@/components/ui";
import { shortDateTime } from "./format";

/**
 * The prototype's grid: Time, Type, Channel, To, Status, Details, Actions, 12px gaps, 11px 18px
 * padding. Same look as the UI kit's TableHead/TableRow, built here so the rows carry ARIA table
 * roles (the primitives take no role props).
 */
const GRID =
  "grid grid-cols-[130px_170px_90px_minmax(0,1fr)_100px_minmax(0,1.2fr)_200px] gap-x-[12px] px-[18px] py-[11px]";

const CHANNEL_ICON: Record<Notification["channel"], LucideIcon> = {
  email: Mail,
  sms: MessageSquare,
  whatsapp: MessageCircle,
};

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
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Superseded rows were replaced by a later message; the API refuses to retry them.
  const retryable = (n.status === "failed" || n.status === "skipped") && n.error !== "superseded";
  const status = badgeFor("notif", n.status);
  const ChannelIcon = CHANNEL_ICON[n.channel];

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
          {
            tone: "bad",
          },
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not retry the message");
    } finally {
      setBusy(false);
    }
  }

  const panelId = `ntf-msg-${n.id}`;
  return (
    <Fragment>
      <div
        role="row"
        className={`${GRID} border-line-soft text-ink items-center border-t text-[13.5px]`}
      >
        <span role="cell" className="text-ink-2 font-mono text-[12.5px]">
          {shortDateTime(n.createdAt, tz)}
        </span>
        <span role="cell" className="font-medium">
          {NOTIFICATION_KIND_LABEL[n.template] ?? n.template}
        </span>
        <span role="cell" className="text-ink-2 flex items-center gap-[6px]">
          <ChannelIcon size={13} className="text-muted shrink-0" aria-hidden="true" />
          {CHANNEL_LABEL[n.channel] ?? n.channel}
        </span>
        <span role="cell" className="text-ink-2 truncate font-mono text-[12.5px]">
          {n.toMasked || "—"}
        </span>
        <span role="cell">
          <Badge tone={status.tone}>{status.label}</Badge>
        </span>
        <span role="cell" className="text-muted text-[13px]">
          {notificationErrorText(n) || "—"}
        </span>
        <span role="cell" className="flex flex-wrap items-center gap-[4px]">
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
              Retry
            </Button>
          ) : null}
          {showPatientLink && n.patientId ? (
            <ButtonLink variant="ghost" size={28} href={`/app/patients/${n.patientId}`}>
              Patient
            </ButtonLink>
          ) : null}
        </span>
      </div>
      {open ? (
        <div role="row">
          <div
            role="cell"
            id={panelId}
            className="border-chip bg-subtle mx-[18px] mb-[14px] flex animate-[mxIn_.2s_ease_both] flex-col motion-reduce:animate-none gap-[8px] rounded-12 border px-[18px] py-[16px]"
          >
            {n.payload.subject ? (
              <>
                <span className="text-muted text-[12px]">Subject</span>
                <span className="text-[14.5px] font-semibold">{n.payload.subject}</span>
              </>
            ) : null}
            <p className="text-ink-2 m-0 mt-[6px] text-[14px] leading-[1.6] whitespace-pre-line">
              {n.payload.body ?? "No message body."}
            </p>
          </div>
        </div>
      ) : null}
      {error ? (
        <div role="row">
          <div role="cell" className="px-[18px] pb-[12px]">
            <p role="alert" className="text-rose m-0 text-[13px]">
              {error}
            </p>
          </div>
        </div>
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
      <EmptyState size="sm">
        No messages yet. Confirmations appear here when an appointment is booked.
      </EmptyState>
    );
  }
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <div role="table" aria-label="Messages" className="min-w-[1000px] max-lg:min-w-[1100px]">
          <div role="rowgroup">
            <div
              role="row"
              className={`${GRID} bg-surface-2 border-line text-muted border-b font-mono text-[10.5px] tracking-[0.08em] uppercase`}
            >
              {["Time", "Type", "Channel", "To", "Status", "Details", "Actions"].map((h) => (
                <span key={h} role="columnheader">
                  {h}
                </span>
              ))}
            </div>
          </div>
          <div role="rowgroup">
            {items.map((n) => (
              <Row
                key={n.id}
                n={n}
                tz={tz}
                showPatientLink={showPatientLink}
                onChanged={onChanged}
              />
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
