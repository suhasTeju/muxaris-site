import type { Callback, Clinic } from "@muxaris/shared";
import { requireActiveClinic, serverApi } from "@/lib/api-server";
import { CallbacksQueue } from "@/components/app/CallbacksQueue";

export const dynamic = "force-dynamic";

export default async function CallbacksPage() {
  const active = await requireActiveClinic();
  const [{ clinic }, open] = await Promise.all([
    serverApi<{ clinic: Clinic }>(`/v1/clinics/${active.clinicId}`),
    serverApi<{ callbacks: Callback[]; total: number }>("/v1/callbacks?status=open&limit=50"),
  ]);
  return (
    <div className="max-w-4xl px-4 py-8 sm:px-8">
      <h1 className="font-display mb-6 text-3xl">Callbacks</h1>
      <CallbacksQueue
        key={active.clinicId}
        initial={open.callbacks}
        initialTotal={open.total}
        tz={clinic.timezone}
      />
    </div>
  );
}
