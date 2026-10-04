import { getActiveClinic, getServerMe } from "@/lib/api-server";
import { Wizard } from "@/components/onboarding/Wizard";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const me = await getServerMe();
  const active = await getActiveClinic();
  const membership = active
    ? me.memberships.find((m) => m.clinicId === active.clinicId)
    : undefined;
  return (
    <Wizard
      initialClinic={membership ? { id: membership.clinicId, name: membership.clinic.name } : null}
      cookieStale={active?.cookieStale ?? false}
    />
  );
}
