import { redirect } from "next/navigation";
import type { UsageSummary } from "@muxaris/shared";
import { apiFetch } from "@/lib/api";
import { currentNextPath, getActiveClinic, getServerMe, getServerToken } from "@/lib/api-server";
import { authConfigured } from "@/lib/amplify";
import { ClinicProvider } from "@/components/app/clinic-context";
import { AppShell } from "@/components/app/AppShell";
import { isUsageSummary } from "@/components/app/usage";
import { AmplifyProvider } from "@/components/auth/amplify-provider";

export const dynamic = "force-dynamic";

async function toSignIn(): Promise<never> {
  redirect(`/sign-in?next=${encodeURIComponent(await currentNextPath())}`);
}

/**
 * Sidebar data (minutes card, Callbacks badge). The layout starts these requests and streams the
 * promises to the shell instead of awaiting them, so no page waits on them. Any failure resolves to
 * null: the card says "Couldn't load usage" and the badge hides. The session was already checked
 * by getServerMe, so this never redirects (a redirect thrown after the layout returned could not).
 */
async function loadForShell<T>(path: string, clinicId: string, token: string): Promise<T | null> {
  try {
    return await apiFetch<T>(path, { clinicId }, { token });
  } catch {
    return null;
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const token = authConfigured ? await getServerToken() : undefined;
  if (!token) return toSignIn();

  const me = await getServerMe();
  const active = await getActiveClinic();
  if (!active) redirect("/onboarding");

  const clinics = me.memberships.map((m) => ({
    id: m.clinicId,
    name: m.clinic.name,
    role: m.role,
  }));
  const usage = loadForShell<unknown>("/v1/usage", active.clinicId, token).then(
    (u): UsageSummary | null => (isUsageSummary(u) ? u : null),
  );
  const openCallbacks = loadForShell<{ total: number }>(
    "/v1/callbacks?status=open&limit=1",
    active.clinicId,
    token,
  ).then((r) => (typeof r?.total === "number" ? r.total : null));

  return (
    <AmplifyProvider>
      <ClinicProvider clinics={clinics} activeId={active.clinicId} cookieStale={active.cookieStale}>
        <AppShell email={me.user.email} usage={usage} openCallbacks={openCallbacks}>
          {children}
        </AppShell>
      </ClinicProvider>
    </AmplifyProvider>
  );
}
