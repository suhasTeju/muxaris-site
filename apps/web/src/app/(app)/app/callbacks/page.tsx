import type { Callback, Clinic } from "@muxaris/shared";
import { requireActiveClinic, serverApi } from "@/lib/api-server";
import { localDateKey } from "@/lib/dashboard";
import { CallbacksQueue } from "@/components/app/CallbacksQueue";

export const dynamic = "force-dynamic";

type Page = { callbacks: Callback[]; total: number };

export default async function CallbacksPage() {
  const active = await requireActiveClinic();
  const [{ clinic }, open, done] = await Promise.all([
    serverApi<{ clinic: Clinic }>(`/v1/clinics/${active.clinicId}`),
    serverApi<Page>("/v1/callbacks?status=open&limit=50"),
    // Only for the Done tab's count and first page; the tab loads it itself if this fails.
    serverApi<Page>("/v1/callbacks?status=done&limit=50").catch(() => null),
  ]);
  return (
    <CallbacksQueue
      key={active.clinicId}
      initial={open.callbacks}
      initialTotal={open.total}
      initialDone={done ? { items: done.callbacks, total: done.total } : undefined}
      tz={clinic.timezone}
      today={localDateKey(new Date(), clinic.timezone)}
    />
  );
}
