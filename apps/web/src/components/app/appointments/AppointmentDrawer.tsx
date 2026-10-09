"use client";

import Link from "next/link";
import type { Appointment } from "@muxaris/shared";
import { Button, Modal, Notice } from "@/components/ui";
import { formatTime, localDateKey } from "@/lib/dashboard";
import { RevealPhone } from "../RevealPhone";
import { StatusBadge } from "../core/StatusBadge";
import { keyDateLong } from "../core/format";
import { FINAL, SOURCE_LABEL, isPast, patientName } from "./shared";

function Row({
  label,
  last,
  children,
}: {
  label: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        last
          ? "grid grid-cols-[110px_minmax(0,1fr)] gap-[10px] py-[12px]"
          : "border-line-soft grid grid-cols-[110px_minmax(0,1fr)] gap-[10px] border-b py-[12px]"
      }
    >
      <dt className="text-muted text-[13px]">{label}</dt>
      <dd className="m-0 text-[14px]">{children}</dd>
    </div>
  );
}

/**
 * Appointment panel from AppAppointments.dc.html: a frosted right-hand drawer (bottom sheet on
 * phones) with the doctor, patient, audited phone reveal and how it was booked, and the actions
 * that fit the appointment's state.
 */
export function AppointmentDrawer({
  appointment: a,
  serviceName,
  doctorName,
  doctorColor,
  tz,
  now,
  busy,
  error,
  onClose,
  onReschedule,
  onCancel,
  onOutcome,
}: {
  appointment: Appointment;
  serviceName: string;
  doctorName: string;
  doctorColor: string;
  tz: string;
  now: Date;
  /** A Completed / No-show request is in flight. */
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onReschedule: () => void;
  onCancel: () => void;
  onOutcome: (status: "completed" | "no_show") => void;
}) {
  const final = FINAL.includes(a.status);
  const past = isPast(a, now);
  const when = `${keyDateLong(localDateKey(a.startsAt, tz))} · ${formatTime(a.startsAt, tz)} – ${formatTime(a.endsAt, tz)}`;

  let actions: React.ReactNode;
  if (final) {
    actions = <span className="text-muted text-[13px]">No actions for this appointment.</span>;
  } else if (past) {
    actions = (
      <>
        <Button
          size={40}
          className="flex-1 shadow-none"
          disabled={busy}
          onClick={() => onOutcome("completed")}
        >
          Completed
        </Button>
        <Button
          variant="secondary"
          size={40}
          className="flex-1 font-semibold"
          disabled={busy}
          onClick={() => onOutcome("no_show")}
        >
          No-show
        </Button>
      </>
    );
  } else {
    actions = (
      <>
        <Button
          variant="secondary"
          size={40}
          className="flex-1 font-semibold"
          onClick={onReschedule}
        >
          Reschedule
        </Button>
        <Button variant="danger-outline" size={40} className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
      </>
    );
  }

  return (
    <Modal
      variant="drawer"
      width={400}
      title={`${serviceName} appointment`}
      onClose={onClose}
      // The design's panel is frosted, its header 20/20/16, the details 8px 20px, the actions 16px 20px.
      className="bg-[rgba(255,255,255,0.96)] backdrop-blur-[20px] [&>div:first-child]:pt-[20px] [&>div:first-child]:pb-[16px] [&>div:nth-child(2)]:py-[8px] [&>div:nth-child(3)]:justify-start [&>div:nth-child(3)]:py-[16px]"
      header={
        <div className="flex flex-col gap-[6px]">
          <StatusBadge kind="appt" value={a.status} className="self-start" />
          <h2 className="m-0 text-[20px] font-semibold tracking-[-0.02em]">{serviceName}</h2>
          <span className="text-ink-2 font-mono text-[12.5px]">{when}</span>
        </div>
      }
      footer={actions}
    >
      <dl className="m-0 flex flex-col">
        <Row label="Doctor">
          <span className="flex items-center gap-[8px]">
            <span
              aria-hidden
              className="size-[8px] shrink-0 rounded-full"
              style={{ background: doctorColor }}
            />
            {doctorName}
          </span>
        </Row>
        <Row label="Patient">
          <Link href={`/app/patients/${a.patientId}`} className="font-medium">
            {patientName(a)}
          </Link>
        </Row>
        <Row label="Phone">
          {a.patient?.phoneMasked ? (
            <RevealPhone
              masked={a.patient.phoneMasked}
              path={`/v1/patients/${encodeURIComponent(a.patientId)}/reveal-phone`}
            />
          ) : (
            "—"
          )}
        </Row>
        <Row label="Booked" last>
          <span className="flex flex-col gap-[2px]">
            <span>{SOURCE_LABEL[a.source] ?? "Booked"}</span>
            {a.createdByCallId ? (
              <Link href={`/app/calls/${a.createdByCallId}`} className="text-[13px] font-medium">
                Open the call
              </Link>
            ) : null}
          </span>
        </Row>
      </dl>
      {error ? <Notice>{error}</Notice> : null}
    </Modal>
  );
}
