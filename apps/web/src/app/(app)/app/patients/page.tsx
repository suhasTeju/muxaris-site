import type { Clinic, Patient } from "@muxaris/shared";
import { requireActiveClinic, serverApi } from "@/lib/api-server";
import { PatientsView } from "@/components/app/PatientsView";

export const dynamic = "force-dynamic";

export default async function PatientsPage() {
  const active = await requireActiveClinic();
  const [{ clinic }, list] = await Promise.all([
    serverApi<{ clinic: Clinic }>(`/v1/clinics/${active.clinicId}`),
    serverApi<{ patients: Patient[]; total: number }>("/v1/patients?limit=50"),
  ]);
  return (
    <div className="max-w-5xl px-4 py-8 sm:px-8">
      <h1 className="font-display mb-6 text-3xl">Patients</h1>
      <PatientsView
        key={active.clinicId}
        initial={list.patients}
        initialTotal={list.total}
        tz={clinic.timezone}
      />
    </div>
  );
}
