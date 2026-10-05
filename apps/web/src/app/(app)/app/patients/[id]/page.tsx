import Link from "next/link";
import { notFound } from "next/navigation";
import type { Clinic, Doctor, Notification, PatientDetail, Service } from "@muxaris/shared";
import { ApiError } from "@/lib/api";
import { requireActiveClinic, serverApi } from "@/lib/api-server";
import { PatientDetailView } from "@/components/app/PatientDetailView";

export const dynamic = "force-dynamic";

export default async function PatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const active = await requireActiveClinic();
  const pid = encodeURIComponent(id);
  let detail: PatientDetail;
  try {
    detail = await serverApi<PatientDetail>(`/v1/patients/${pid}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const [{ clinic }, doctors, services, notifications] = await Promise.all([
    serverApi<{ clinic: Clinic }>(`/v1/clinics/${active.clinicId}`),
    serverApi<{ doctors: Doctor[] }>("/v1/doctors"),
    serverApi<{ services: Service[] }>("/v1/services"),
    serverApi<{ notifications: Notification[]; total: number }>(
      `/v1/notifications?patientId=${pid}&limit=50`,
    ),
  ]);
  return (
    <div className="max-w-4xl px-4 py-8 sm:px-8">
      <Link
        href="/app/patients"
        className="text-muted mb-4 inline-block text-sm underline-offset-4 hover:underline"
      >
        ← Patients
      </Link>
      <PatientDetailView
        key={detail.patient.id}
        detail={detail}
        doctors={doctors.doctors}
        services={services.services}
        notifications={notifications.notifications}
        tz={clinic.timezone}
      />
    </div>
  );
}
