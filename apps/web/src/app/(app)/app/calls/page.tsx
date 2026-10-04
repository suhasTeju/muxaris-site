import type { Call, Clinic } from "@muxaris/shared";
import { getActiveClinic, serverApi } from "@/lib/api-server";
import { CallList } from "@/components/app/CallList";

export const dynamic = "force-dynamic";

export default async function CallsPage() {
  const active = await getActiveClinic();
  const [{ clinic }, { calls }] = await Promise.all([
    serverApi<{ clinic: Clinic }>(`/v1/clinics/${active!.clinicId}`),
    serverApi<{ calls: Call[] }>("/v1/calls?limit=50"),
  ]);
  return (
    <div className="px-4 py-8 sm:px-8">
      <h1 className="font-display mb-6 text-3xl">Calls</h1>
      <CallList calls={calls} tz={clinic.timezone} />
    </div>
  );
}
