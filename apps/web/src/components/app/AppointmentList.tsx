"use client";

import { useState } from "react";
import { EmptyState } from "./EmptyState";
import type { Appointment, Doctor, Patient, Service } from "@muxaris/shared";
import { formatTime, groupByDoctor, maskPhone } from "@/lib/dashboard";
import { AppointmentStatusBadge } from "./Badge";
import { ghostBtn } from "./Modal";

export interface AppointmentListProps {
  appointments: Appointment[];
  doctors: Pick<Doctor, "id" | "name" | "color">[];
  services: Pick<Service, "id" | "name">[];
  patients: Pick<Patient, "id" | "phone" | "name">[];
  tz: string;
  onCancel?: (a: Appointment) => void;
  onReschedule?: (a: Appointment) => void;
  emptyText?: string;
}

const ACTIVE: Appointment["status"][] = ["scheduled", "confirmed", "rescheduled"];

function PhoneCell({ phone }: { phone: string }) {
  const [shown, setShown] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setShown((s) => !s)}
      aria-label={
        shown
          ? `Phone ${phone}. Hide full number`
          : `Phone ending ${maskPhone(phone)}. Show full number`
      }
      className="text-muted min-h-8 rounded px-1 text-sm tabular-nums hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
    >
      {shown ? phone : maskPhone(phone)}
    </button>
  );
}

export function AppointmentList({
  appointments,
  doctors,
  services,
  patients,
  tz,
  onCancel,
  onReschedule,
  emptyText = "No appointments today. Your assistant will book them as calls come in.",
}: AppointmentListProps) {
  if (appointments.length === 0) {
    return <EmptyState>{emptyText}</EmptyState>;
  }
  const service = new Map(services.map((s) => [s.id, s.name]));
  const patient = new Map(patients.map((p) => [p.id, p]));
  const groups = groupByDoctor(appointments, doctors);
  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => (
        <section key={g.doctorId} aria-label={g.doctorName}>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
            <span
              aria-hidden="true"
              className="inline-block size-2.5 rounded-full"
              style={{ background: g.color ?? "var(--color-muted)" }}
            />
            {g.doctorName}
            <span className="text-muted font-normal">({g.items.length})</span>
          </h3>
          <ul className="border-line bg-surface divide-line divide-y rounded-card border">
            {g.items.map((a) => {
              const p = patient.get(a.patientId);
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                  <span className="w-20 text-[15px] font-medium tabular-nums">
                    {formatTime(a.startsAt, tz)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px]">
                      {service.get(a.serviceId) ?? "Appointment"}
                      {p?.name ? <span className="text-muted"> · {p.name}</span> : null}
                    </span>
                    {p ? <PhoneCell phone={p.phone} /> : null}
                  </span>
                  <AppointmentStatusBadge status={a.status} />
                  {(onCancel || onReschedule) && ACTIVE.includes(a.status) ? (
                    <span className="flex gap-2">
                      {onReschedule && (
                        <button type="button" className={ghostBtn} onClick={() => onReschedule(a)}>
                          Reschedule
                        </button>
                      )}
                      {onCancel && (
                        <button type="button" className={ghostBtn} onClick={() => onCancel(a)}>
                          Cancel
                        </button>
                      )}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
