import type { Appointment, Call, Clinic, Doctor, Patient, Service } from "@muxaris/shared";
import { requireActiveClinic, serverApi } from "@/lib/api-server";
import { dayRange, localDateKey, toSection, type Usage } from "@/lib/dashboard";
import { OverviewView } from "@/components/app/OverviewView";

export const dynamic = "force-dynamic";

export default async function AppHome() {
  const active = await requireActiveClinic();
  // Without the clinic record there is no timezone to anchor "today"; let the error boundary handle it.
  const { clinic } = await serverApi<{ clinic: Clinic }>(`/v1/clinics/${active.clinicId}`);
  const tz = clinic.timezone;
  const { from, to } = dayRange(localDateKey(new Date(), tz), 1, tz);
  const [appts, doctors, services, patients, todayCalls, recentCalls, usage] =
    await Promise.allSettled([
      serverApi<{ appointments: Appointment[] }>(
        `/v1/appointments?${new URLSearchParams({ from, to })}`,
      ),
      serverApi<{ doctors: Doctor[] }>("/v1/doctors"),
      serverApi<{ services: Service[] }>("/v1/services"),
      serverApi<{ patients: Patient[] }>("/v1/patients?limit=200"),
      // Today's calls in the clinic timezone (capped at the API's 200-per-page maximum).
      serverApi<{ calls: Call[] }>(`/v1/calls?${new URLSearchParams({ from, to, limit: "200" })}`),
      serverApi<{ calls: Call[] }>("/v1/calls?limit=5"),
      serverApi<Usage>("/v1/usage"),
    ]);

  const appointments =
    appts.status === "fulfilled" &&
    doctors.status === "fulfilled" &&
    services.status === "fulfilled" &&
    patients.status === "fulfilled"
      ? {
          ok: true as const,
          data: {
            appointments: appts.value.appointments,
            doctors: doctors.value.doctors,
            services: services.value.services,
            patients: patients.value.patients,
          },
        }
      : { ok: false as const };
  const callsOf = (r: PromiseSettledResult<{ calls: Call[] }>) => {
    const s = toSection(r);
    return s.ok ? { ok: true as const, data: s.data.calls } : s;
  };

  return (
    <OverviewView
      clinicName={clinic.name}
      tz={tz}
      todayCalls={callsOf(todayCalls)}
      recentCalls={callsOf(recentCalls)}
      usage={toSection(usage)}
      appointments={appointments}
    />
  );
}
