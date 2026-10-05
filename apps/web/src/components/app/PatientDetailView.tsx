"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Doctor, Notification, PatientDetail, Service } from "@muxaris/shared";
import { formatDateTime, languageLabel } from "@/lib/dashboard";
import { AppointmentStatusBadge, Badge, OutcomeBadge } from "./Badge";
import { ghostBtn } from "./Modal";
import { NotificationsTable } from "./NotificationsTable";
import { PatientForm } from "./PatientForm";
import { RevealPhone } from "./RevealPhone";

export function PatientDetailView({
  detail,
  doctors,
  services,
  notifications,
  tz,
}: {
  detail: PatientDetail;
  doctors: Pick<Doctor, "id" | "name">[];
  services: Pick<Service, "id" | "name">[];
  notifications: Notification[];
  tz: string;
}) {
  const router = useRouter();
  const { patient, appointments, calls } = detail;
  const [editing, setEditing] = useState(false);
  const [messages, setMessages] = useState(notifications);
  const doctor = new Map(doctors.map((d) => [d.id, d.name]));
  const service = new Map(services.map((s) => [s.id, s.name]));

  const section = "border-line bg-surface rounded-card border p-5";
  return (
    <div className="flex flex-col gap-5">
      <section className={section}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-3xl">{patient.name ?? "Unnamed patient"}</h1>
            <div className="flex flex-wrap items-center gap-3">
              <RevealPhone
                masked={patient.phoneMasked}
                path={`/v1/patients/${encodeURIComponent(patient.id)}/reveal-phone`}
              />
              <Badge tone="muted">{languageLabel(patient.preferredLanguage)}</Badge>
            </div>
            {patient.email ? <p className="text-muted text-sm">{patient.email}</p> : null}
            {patient.notes ? <p className="text-[15px]">{patient.notes}</p> : null}
          </div>
          {!editing ? (
            <button type="button" className={ghostBtn} onClick={() => setEditing(true)}>
              Edit
            </button>
          ) : null}
        </div>
        {editing ? (
          <div className="border-line mt-4 border-t pt-4">
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
                router.refresh();
              }}
            />
          </div>
        ) : null}
      </section>

      <section className={section} aria-labelledby="pd-visits">
        <h2 id="pd-visits" className="font-display mb-3 text-xl">
          Visits
        </h2>
        {appointments.length === 0 ? (
          <p className="text-muted">No visits yet.</p>
        ) : (
          <ul className="divide-line divide-y">
            {appointments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                <span className="w-44 text-[15px] font-medium">
                  {formatDateTime(a.startsAt, tz)}
                </span>
                <span className="min-w-0 flex-1 text-[15px]">
                  {service.get(a.serviceId) ?? "Appointment"}
                  <span className="text-muted"> · {doctor.get(a.doctorId) ?? "Unassigned"}</span>
                </span>
                <AppointmentStatusBadge status={a.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={section} aria-labelledby="pd-calls">
        <h2 id="pd-calls" className="font-display mb-3 text-xl">
          Calls
        </h2>
        {calls.length === 0 ? (
          <p className="text-muted">No calls yet.</p>
        ) : (
          <ul className="divide-line divide-y">
            {calls.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                <Link
                  href={`/app/calls/${c.id}`}
                  className="text-accent-deep w-44 text-[15px] font-medium underline-offset-4 hover:underline"
                >
                  {formatDateTime(c.startedAt, tz)}
                </Link>
                <OutcomeBadge outcome={c.outcome} />
                <span className="text-muted min-w-0 flex-1 text-[15px]">
                  {c.summary ?? "No summary"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="pd-messages">
        <h2 id="pd-messages" className="font-display mb-3 text-xl">
          Messages
        </h2>
        <NotificationsTable
          items={messages}
          tz={tz}
          onChanged={(n) => setMessages((prev) => prev.map((x) => (x.id === n.id ? n : x)))}
        />
      </section>
    </div>
  );
}
