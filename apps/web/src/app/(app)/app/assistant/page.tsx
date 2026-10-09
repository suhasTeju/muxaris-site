import type { AssistantProfile, Clinic, Role } from "@muxaris/shared";
import { ApiError } from "@/lib/api";
import { requireActiveClinic, serverApi } from "@/lib/api-server";
import { AssistantView } from "@/components/app/assistant/AssistantView";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const active = await requireActiveClinic();
  const [{ clinic, role }, assistant] = await Promise.all([
    serverApi<{ clinic: Clinic; role: Role }>(`/v1/clinics/${active.clinicId}`),
    serverApi<{ assistant: AssistantProfile }>("/v1/assistant").catch((e) => {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }),
  ]);
  return (
    <AssistantView
      key={clinic.id}
      clinic={clinic}
      role={role}
      assistant={assistant?.assistant ?? null}
    />
  );
}
