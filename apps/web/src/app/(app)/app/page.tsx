import Link from "next/link";
import type { Appointment, Call, Clinic, Doctor, Patient, Service } from "@muxaris/shared";
import { getActiveClinic, serverApi } from "@/lib/api-server";
import { computeKpis, dayRange, localDateKey, type Usage } from "@/lib/dashboard";
import { AppointmentList } from "@/components/app/AppointmentList";
import { CallList } from "@/components/app/CallList";
import { KpiCard } from "@/components/app/KpiCard";

export const dynamic = "force-dynamic";

export default async function AppHome() {
  const active = await getActiveClinic();
  const { clinic } = await serverApi<{ clinic: Clinic }>(`/v1/clinics/${active!.clinicId}`);
  const tz = clinic.timezone;
  const { from, to } = dayRange(localDateKey(new Date(), tz), 1, tz);
  const [appts, doctors, services, patients, calls, usage] = await Promise.all([
    serverApi<{ appointments: Appointment[] }>(
      `/v1/appointments?${new URLSearchParams({ from, to })}`,
    ),
    serverApi<{ doctors: Doctor[] }>("/v1/doctors"),
    serverApi<{ services: Service[] }>("/v1/services"),
    serverApi<{ patients: Patient[] }>("/v1/patients?limit=200"),
    serverApi<{ calls: Call[] }>("/v1/calls?limit=50"),
    serverApi<Usage>("/v1/usage"),
  ]);
  const kpis = computeKpis({ calls: calls.calls, usage, tz });

  return (
    <div className="px-4 py-8 sm:px-8">
      <h1 className="font-display text-3xl">Overview</h1>
      <p className="text-muted mt-1">{clinic.name}</p>

      <section aria-label="Key numbers" className="mt-6 grid gap-4 sm:grid-cols-3">
        <KpiCard label="Calls today" value={String(kpis.callsToday)} />
        <KpiCard
          label="Booked today"
          value={String(kpis.bookedToday)}
          hint="Calls that ended in a booking"
        />
        <KpiCard
          label="Minutes used this month"
          value={`${kpis.minutesUsed} / ${kpis.minutesIncluded}`}
          ratio={kpis.usageRatio}
          hint={`${usage.plan === "pilot" ? "Pilot" : "Standard"} plan`}
        />
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
          <AppointmentList
            appointments={appts.appointments}
            doctors={doctors.doctors}
            services={services.services}
            patients={patients.patients}
            tz={tz}
          />
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
          <CallList calls={calls.calls.slice(0, 5)} tz={tz} />
        </section>
      </div>
    </div>
  );
}
