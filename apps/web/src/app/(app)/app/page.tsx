import type {
  Appointment,
  Call,
  Callback,
  Clinic,
  Doctor,
  Patient,
  Service,
} from "@muxaris/shared";
import { requireActiveClinic, serverApi } from "@/lib/api-server";
import { dayRange, localDateKey, toSection, type OverviewStats, type Usage } from "@/lib/dashboard";
import { OverviewView } from "@/components/app/OverviewView";
import { patientNamesFrom } from "@/components/app/core/calls";

export const dynamic = "force-dynamic";

export default async function AppHome() {
  const active = await requireActiveClinic();
  // Without the clinic record there is no timezone to anchor "today"; let the error boundary handle it.
  const { clinic } = await serverApi<{ clinic: Clinic }>(`/v1/clinics/${active.clinicId}`);
  const tz = clinic.timezone;
  const now = new Date();
  const today = localDateKey(now, tz);
  const { from, to } = dayRange(today, 1, tz);
  const [appts, doctors, services, stats, recentCalls, usage, openCallbacks, patients] =
    await Promise.allSettled([
      serverApi<{ appointments: Appointment[] }>(
        `/v1/appointments?${new URLSearchParams({ from, to })}`,
      ),
      serverApi<{ doctors: Doctor[] }>("/v1/doctors"),
      serverApi<{ services: Service[] }>("/v1/services"),
      serverApi<OverviewStats>(`/v1/stats/overview?${new URLSearchParams({ date: today })}`),
      serverApi<{ calls: Call[] }>("/v1/calls?limit=5"),
      serverApi<Usage>("/v1/usage"),
      // The "N urgent" badge: the stats endpoint counts open callbacks but not their priority.
      serverApi<{ callbacks: Callback[] }>("/v1/callbacks?status=open&limit=200"),
      // Call rows carry only the patient id; names come from the latest patients.
      serverApi<{ patients: Patient[] }>("/v1/patients?limit=200"),
    ]);

  const appointments =
    appts.status === "fulfilled" &&
    doctors.status === "fulfilled" &&
    services.status === "fulfilled"
      ? {
          ok: true as const,
          data: {
            appointments: appts.value.appointments,
            doctors: doctors.value.doctors,
            services: services.value.services,
          },
        }
      : { ok: false as const };
  const callsOf = (r: PromiseSettledResult<{ calls: Call[] }>) => {
    const s = toSection(r);
    return s.ok ? { ok: true as const, data: s.data.calls } : s;
  };
  const urgent =
    openCallbacks.status === "fulfilled"
      ? openCallbacks.value.callbacks.filter((c) => c.priority === "urgent").length
      : null;
  const patientNames =
    patients.status === "fulfilled" ? patientNamesFrom(patients.value.patients) : {};

  return (
    <OverviewView
      clinicName={clinic.name}
      tz={tz}
      now={now}
      stats={toSection(stats)}
      recentCalls={callsOf(recentCalls)}
      usage={toSection(usage)}
      appointments={appointments}
      urgentCallbacks={urgent}
      patientNames={patientNames}
    />
  );
}
