import { redirect, unstable_rethrow } from "next/navigation";
import type { UsageSummary } from "@muxaris/shared";
import {
  currentNextPath,
  getActiveClinic,
  getServerMe,
  getServerToken,
  serverApi,
} from "@/lib/api-server";
import { authConfigured } from "@/lib/amplify";
import { ClinicProvider } from "@/components/app/clinic-context";
import { AppShell } from "@/components/app/AppShell";
import { AmplifyProvider } from "@/components/auth/amplify-provider";

export const dynamic = "force-dynamic";

async function toSignIn(): Promise<never> {
  redirect(`/sign-in?next=${encodeURIComponent(await currentNextPath())}`);
}

/** Minutes for the sidebar card; the shell still renders (with a dash) if the call fails. */
async function loadUsage(clinicId: string): Promise<UsageSummary | null> {
  try {
    return await serverApi<UsageSummary>("/v1/usage", { clinicId });
  } catch (err) {
    unstable_rethrow(err);
    return null;
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!authConfigured || !(await getServerToken())) await toSignIn();

  const me = await getServerMe();
  const active = await getActiveClinic();
  if (!active) redirect("/onboarding");

  const clinics = me.memberships.map((m) => ({
    id: m.clinicId,
    name: m.clinic.name,
    role: m.role,
  }));
  const usage = await loadUsage(active.clinicId);

  return (
    <AmplifyProvider>
      <ClinicProvider clinics={clinics} activeId={active.clinicId} cookieStale={active.cookieStale}>
        <AppShell email={me.user.email} usage={usage}>
          {children}
        </AppShell>
      </ClinicProvider>
    </AmplifyProvider>
  );
}
