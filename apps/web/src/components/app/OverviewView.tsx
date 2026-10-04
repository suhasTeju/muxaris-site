import Link from "next/link";
import type { Appointment, Call, Doctor, Service } from "@muxaris/shared";
import { formatDuration, type OverviewStats, type Section, type Usage } from "@/lib/dashboard";
import { AppointmentList } from "./AppointmentList";
import { CallList } from "./CallList";
import { KpiCard } from "./KpiCard";

export interface TodayAppointments {
  appointments: Appointment[];
  doctors: Doctor[];
  services: Service[];
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
  stats,
  usage,
  appointments,
  recentCalls,
}: {
  clinicName: string;
  tz: string;
  stats: Section<OverviewStats>;
  usage: Section<Usage>;
  appointments: Section<TodayAppointments>;
  recentCalls: Section<Call[]>;
}) {
  const minutesUsed = usage.ok ? Math.ceil(usage.data.callSeconds / 60) : 0;
  const minutesIncluded = usage.ok ? usage.data.includedCallMinutes : 0;
  const usageRatio = minutesIncluded > 0 ? Math.min(1, minutesUsed / minutesIncluded) : 0;
  const fail = stats.ok ? undefined : "Couldn't load";
  return (
    <div className="px-4 py-8 sm:px-8">
      <h1 className="font-display text-3xl">Overview</h1>
      <p className="text-muted mt-1">{clinicName}</p>

      <section aria-label="Key numbers" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Calls today"
          value={stats.ok ? String(stats.data.callsToday) : DASH}
          hint={
            fail ?? (stats.ok ? `Average ${formatDuration(stats.data.avgDurationS)}` : undefined)
          }
        />
        <KpiCard
          label="Booked by assistant"
          value={stats.ok ? String(stats.data.bookedToday) : DASH}
          hint={fail ?? "Calls that ended in a booking today"}
        />
        <KpiCard
          label="Open callbacks"
          value={stats.ok ? String(stats.data.openCallbacks) : DASH}
          hint={fail ?? "View the callback queue"}
          href="/app/callbacks"
        />
        {usage.ok ? (
          <KpiCard
            label="Minutes used this month"
            value={`${minutesUsed} / ${minutesIncluded}`}
            ratio={usageRatio}
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
