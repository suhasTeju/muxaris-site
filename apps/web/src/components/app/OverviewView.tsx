import Link from "next/link";
import type { Appointment, Call, Doctor, Patient, Service } from "@muxaris/shared";
import { computeKpis, type Section, type Usage } from "@/lib/dashboard";
import { AppointmentList } from "./AppointmentList";
import { CallList } from "./CallList";
import { KpiCard } from "./KpiCard";

export interface TodayAppointments {
  appointments: Appointment[];
  doctors: Doctor[];
  services: Service[];
  patients: Patient[];
}

function Unavailable({ what }: { what: string }) {
  return (
    <p role="alert" className="text-danger py-4 text-sm">
      Couldn&apos;t load {what}. Refresh the page to try again.
    </p>
  );
}

const DASH = "–";

export function OverviewView({
  clinicName,
  tz,
  todayCalls,
  usage,
  appointments,
  recentCalls,
}: {
  clinicName: string;
  tz: string;
  todayCalls: Section<Call[]>;
  usage: Section<Usage>;
  appointments: Section<TodayAppointments>;
  recentCalls: Section<Call[]>;
}) {
  const kpis = computeKpis({
    calls: todayCalls.ok ? todayCalls.data : [],
    usage: usage.ok ? usage.data : null,
    tz,
  });
  return (
    <div className="px-4 py-8 sm:px-8">
      <h1 className="font-display text-3xl">Overview</h1>
      <p className="text-muted mt-1">{clinicName}</p>

      <section aria-label="Key numbers" className="mt-6 grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Calls today"
          value={todayCalls.ok ? String(kpis.callsToday) : DASH}
          hint={todayCalls.ok ? undefined : "Couldn't load"}
        />
        <KpiCard
          label="Booked today"
          value={todayCalls.ok ? String(kpis.bookedToday) : DASH}
          hint={todayCalls.ok ? "Calls that ended in a booking" : "Couldn't load"}
        />
        {usage.ok ? (
          <KpiCard
            label="Minutes used this month"
            value={`${kpis.minutesUsed} / ${kpis.minutesIncluded}`}
            ratio={kpis.usageRatio}
            hint={`${usage.data.plan === "pilot" ? "Pilot" : "Standard"} plan`}
          />
        ) : (
          <KpiCard label="Minutes used this month" value={DASH} hint="Couldn't load" />
        )}
      </section>

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <section aria-labelledby="today-h">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="today-h" className="font-display text-xl">
              Today&apos;s appointments
            </h2>
            <Link
              href="/app/appointments"
              className="text-accent-deep text-sm underline-offset-4 hover:underline"
            >
              All appointments
            </Link>
          </div>
          {appointments.ok ? (
            <AppointmentList
              appointments={appointments.data.appointments}
              doctors={appointments.data.doctors}
              services={appointments.data.services}
              patients={appointments.data.patients}
              tz={tz}
            />
          ) : (
            <Unavailable what="today's appointments" />
          )}
        </section>
        <section aria-labelledby="calls-h">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="calls-h" className="font-display text-xl">
              Recent calls
            </h2>
            <Link
              href="/app/calls"
              className="text-accent-deep text-sm underline-offset-4 hover:underline"
            >
              All calls
            </Link>
          </div>
          {recentCalls.ok ? (
            <CallList calls={recentCalls.data} tz={tz} />
          ) : (
            <Unavailable what="recent calls" />
          )}
        </section>
      </div>
    </div>
  );
}
