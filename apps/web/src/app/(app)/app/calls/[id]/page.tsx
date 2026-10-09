import { notFound } from "next/navigation";
import type { Call, CallTurn, Callback, Clinic, PatientDetail } from "@muxaris/shared";
import { ApiError } from "@/lib/api";
import { requireActiveClinic, serverApi } from "@/lib/api-server";
import { CallDetail } from "@/components/app/CallDetail";

export const dynamic = "force-dynamic";

export default async function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const active = await requireActiveClinic();
  let data: { call: Call; turns: CallTurn[]; callbacks?: Callback[] };
  try {
    data = await serverApi<{ call: Call; turns: CallTurn[]; callbacks?: Callback[] }>(
      `/v1/calls/${encodeURIComponent(id)}`,
    );
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const patientId = data.call.patientId;
  const [{ clinic }, patient] = await Promise.all([
    serverApi<{ clinic: Clinic }>(`/v1/clinics/${active.clinicId}`),
    // The call row carries only the patient id; the name in the header is best effort.
    patientId
      ? serverApi<PatientDetail>(`/v1/patients/${encodeURIComponent(patientId)}`).catch(() => null)
      : Promise.resolve(null),
  ]);
  return (
    <CallDetail
      key={data.call.id}
      initialCall={data.call}
      turns={data.turns}
      callbacks={data.callbacks ?? []}
      tz={clinic.timezone}
      patientName={patient?.patient.name ?? null}
    />
  );
}
