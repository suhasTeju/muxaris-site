import { notFound } from "next/navigation";
import type { Call, CallTurn, Callback, Clinic } from "@muxaris/shared";
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
  const { clinic } = await serverApi<{ clinic: Clinic }>(`/v1/clinics/${active.clinicId}`);
  return (
    <CallDetail
      key={data.call.id}
      initialCall={data.call}
      turns={data.turns}
      callbacks={data.callbacks ?? []}
      tz={clinic.timezone}
      // From this GET: an outcome save returns the call without the joined name.
      patientName={data.call.patientName ?? null}
    />
  );
}
