"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pencil } from "lucide-react";
import {
  NOTIFICATION_KIND_LABEL,
  type Doctor,
  type Notification,
  type PatientDetail,
  type Service,
} from "@muxaris/shared";
import { BackLink, Badge, Button, Card, useToast } from "@/components/ui";
import { CHANNEL_LABEL, formatDateTime, formatTime, languageLabel } from "@/lib/dashboard";
import { PatientForm } from "./PatientForm";
import { RevealPhone } from "./RevealPhone";
import { StatusBadge } from "./core/StatusBadge";
import { formatDayShort, initials, keyDob } from "./core/format";

const ROW =
  "border-line-soft grid items-center gap-[12px] border-t px-[18px] py-[11px] text-[14px]";
const WHEN = "text-ink-2 font-mono text-[12.5px]";
/** Below 640px the date takes its own line above the row's content and badge. */
const ROW_STACK = "max-sm:gap-y-[4px]";
const WHEN_STACK = `${WHEN} max-sm:col-span-full`;

function Section({
  id,
  title,
  empty,
  children,
}: {
  id: string;
  title: string;
  /** Shown instead of the rows when there are none. */
  empty: string | null;
  children: React.ReactNode;
}) {
  return (
    <Card aria-labelledby={id} className="overflow-hidden">
      <h2
        id={id}
        className="border-chip m-0 border-b px-[18px] py-[16px] text-[15px] font-semibold"
      >
        {title}
      </h2>
      {empty ? (
        <p className="text-muted m-0 p-[18px] text-[14px] italic">{empty}</p>
      ) : (
        <ul className="m-0 list-none p-0">{children}</ul>
      )}
    </Card>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[4px]">
      <dt className="text-muted text-[12px]">{label}</dt>
      <dd className="m-0 text-[14px]">{children}</dd>
    </div>
  );
}

/** Patient page from AppPatients.dc.html (`#patients/p1`): profile card, Visits, Calls, Messages. */
export function PatientDetailView({
  detail,
  doctors,
  services,
  notifications,
  tz,
  initialEditing = false,
}: {
  detail: PatientDetail;
  doctors: Pick<Doctor, "id" | "name">[];
  services: Pick<Service, "id" | "name">[];
  notifications: Notification[];
  tz: string;
  /** Open the inline editor on mount (dev previews). */
  initialEditing?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { patient, appointments, calls } = detail;
  const [editing, setEditing] = useState(initialEditing);
  const doctor = new Map(doctors.map((d) => [d.id, d.name]));
  const service = new Map(services.map((s) => [s.id, s.name]));

  return (
    <div className="animate-mx-in flex flex-col gap-[18px]">
      <BackLink href="/app/patients">Patients</BackLink>
      <div className="grid items-start gap-[14px] lg:grid-cols-[340px_minmax(0,1fr)]">
        <Card
          radius={18}
          aria-label="Patient details"
          className="flex flex-col gap-[18px] p-[22px] lg:sticky lg:top-[84px]"
        >
          <div className="flex items-center gap-[14px]">
            <span
              aria-hidden
              className="bg-teal-soft text-teal-ink grid size-[52px] shrink-0 place-items-center rounded-full text-[18px] font-semibold"
            >
              {initials(patient.name)}
            </span>
            <div className="flex min-w-0 flex-col gap-[4px]">
              <h1 className="m-0 text-[22px] leading-[1.2] font-semibold tracking-[-0.025em]">
                {patient.name || "Unnamed"}
              </h1>
              <Badge tone="info" dot={false} className="self-start">
                {languageLabel(patient.preferredLanguage)}
              </Badge>
            </div>
          </div>
          {editing ? (
            <PatientForm
              mode="edit"
              patientId={patient.id}
              initial={{
                name: patient.name,
                email: patient.email,
                preferredLanguage: patient.preferredLanguage,
                dob: patient.dob,
                notes: patient.notes,
              }}
              onCancel={() => setEditing(false)}
              onSaved={() => {
                setEditing(false);
                toast("Patient updated");
                router.refresh();
              }}
            />
          ) : (
            <>
              <dl className="m-0 flex flex-col gap-[14px]">
                <Detail label="Phone">
                  <RevealPhone
                    masked={patient.phoneMasked}
                    path={`/v1/patients/${encodeURIComponent(patient.id)}/reveal-phone`}
                  />
                </Detail>
                <Detail label="Email">{patient.email || "No email on file"}</Detail>
                <Detail label="Date of birth">{patient.dob ? keyDob(patient.dob) : "—"}</Detail>
                <Detail label="Notes">
                  <span className="text-ink-2 leading-[1.5]">{patient.notes || "—"}</span>
                </Detail>
              </dl>
              <Button
                variant="secondary"
                size={38}
                icon={Pencil}
                iconSize={14}
                onClick={() => setEditing(true)}
              >
                Edit
              </Button>
            </>
          )}
        </Card>

        <div className="flex min-w-0 flex-col gap-[14px]">
          <Section
            id="pd-visits"
            title="Visits"
            empty={appointments.length ? null : "No visits yet."}
          >
            {appointments.map((a) => (
              <li
                key={a.id}
                className={`${ROW} ${ROW_STACK} grid-cols-[150px_minmax(0,1fr)_auto] max-sm:grid-cols-[minmax(0,1fr)_auto]`}
              >
                <span className={WHEN_STACK}>{formatDateTime(a.startsAt, tz)}</span>
                <span className="min-w-0">
                  {service.get(a.serviceId) ?? "Appointment"} ·{" "}
                  {doctor.get(a.doctorId) ?? "Unassigned"}
                </span>
                <StatusBadge kind="appt" value={a.status} />
              </li>
            ))}
          </Section>
          <Section id="pd-calls" title="Calls" empty={calls.length ? null : "No calls yet."}>
            {calls.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/app/calls/${c.id}`}
                  className={`${ROW} text-ink hover:bg-subtle hover:text-ink ${ROW_STACK} grid-cols-[150px_auto_minmax(0,1fr)] max-sm:grid-cols-[auto_minmax(0,1fr)]`}
                >
                  <span className={WHEN_STACK}>{formatDateTime(c.startedAt, tz)}</span>
                  <StatusBadge kind="outcome" value={c.outcome} />
                  <span className="text-muted truncate">{c.summary || "No summary"}</span>
                </Link>
              </li>
            ))}
          </Section>
          <Section
            id="pd-messages"
            title="Messages"
            empty={notifications.length ? null : "No messages yet."}
          >
            {notifications.map((n) => (
              <li
                key={n.id}
                className={`${ROW} ${ROW_STACK} grid-cols-[150px_minmax(0,1fr)_auto] max-sm:grid-cols-[minmax(0,1fr)_auto]`}
              >
                <span className={WHEN_STACK}>
                  {formatDayShort(n.createdAt, tz)}, {formatTime(n.createdAt, tz)}
                </span>
                <span className="min-w-0">
                  {NOTIFICATION_KIND_LABEL[n.template]}{" "}
                  <span className="text-muted">· {CHANNEL_LABEL[n.channel]}</span>
                </span>
                <StatusBadge kind="notif" value={n.status} />
              </li>
            ))}
          </Section>
        </div>
      </div>
    </div>
  );
}
