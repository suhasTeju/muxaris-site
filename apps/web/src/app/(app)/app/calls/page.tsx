import type { Call, Clinic } from "@muxaris/shared";
import { requireActiveClinic, serverApi } from "@/lib/api-server";
import { CALLS_PAGE_SIZE } from "@/lib/dashboard";
import { CallsBrowser } from "@/components/app/CallsBrowser";

export const dynamic = "force-dynamic";

export default async function CallsPage() {
  const active = await requireActiveClinic();
  const [{ clinic }, { calls }] = await Promise.all([
    serverApi<{ clinic: Clinic }>(`/v1/clinics/${active.clinicId}`),
    serverApi<{ calls: Call[] }>(`/v1/calls?limit=${CALLS_PAGE_SIZE}`),
  ]);
  return (
    <div className="px-4 py-8 sm:px-8">
      <h1 className="font-display mb-6 text-3xl">Calls</h1>
      <CallsBrowser key={active.clinicId} initial={calls} tz={clinic.timezone} />
    </div>
  );
}
