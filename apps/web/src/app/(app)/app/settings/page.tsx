import type {
  AssistantProfile,
  BillingStatus,
  Clinic,
  Doctor,
  Role,
  Service,
  SlotRules,
  UsageSummary,
} from "@muxaris/shared";
import { ApiError } from "@/lib/api";
import { requireActiveClinic, serverApi } from "@/lib/api-server";
import { SettingsView } from "@/components/app/settings/SettingsView";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const active = await requireActiveClinic();
  const assistantReq = serverApi<{ assistant: AssistantProfile }>("/v1/assistant").catch((e) => {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  });
  const [{ clinic, role }, doctors, services, rules, assistant, usage, billingStatus] =
    await Promise.all([
      serverApi<{ clinic: Clinic; role: Role }>(`/v1/clinics/${active.clinicId}`),
      serverApi<{ doctors: Doctor[] }>("/v1/doctors"),
      serverApi<{ services: Service[] }>("/v1/services"),
      serverApi<{ slotRules: SlotRules }>("/v1/slot-rules"),
      assistantReq,
      serverApi<UsageSummary>("/v1/usage").catch(() => null),
      serverApi<BillingStatus>("/v1/billing").catch((): BillingStatus => ({
        enabled: false,
        keyId: null,
        subscription: null,
      })),
    ]);

  return (
    <SettingsView
      clinic={clinic}
      role={role}
      doctors={doctors.doctors}
      services={services.services}
      slotRules={rules.slotRules}
      assistant={assistant?.assistant ?? null}
      usage={usage}
      billing={{ enabled: billingStatus.enabled }}
      subscriptionStatus={billingStatus.subscription?.status}
    />
  );
}
