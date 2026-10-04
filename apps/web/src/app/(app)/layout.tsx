import { redirect } from "next/navigation";
import { currentNextPath, getActiveClinic, getServerMe, getServerToken } from "@/lib/api-server";
import { authConfigured } from "@/lib/amplify";
import { ClinicProvider } from "@/components/app/clinic-context";
import { ClinicSwitcher } from "@/components/app/clinic-switcher";
import { AppShell } from "@/components/app/AppShell";
import { AmplifyProvider } from "@/components/auth/amplify-provider";
import { SignOutButton } from "@/components/app/sign-out-button";

export const dynamic = "force-dynamic";

async function toSignIn(): Promise<never> {
  redirect(`/sign-in?next=${encodeURIComponent(await currentNextPath())}`);
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

  return (
    <AmplifyProvider>
      <ClinicProvider clinics={clinics} activeId={active.clinicId} cookieStale={active.cookieStale}>
        <AppShell
          switcher={<ClinicSwitcher />}
          right={
            <>
              <span className="text-muted hidden text-sm sm:inline">{me.user.email}</span>
              <SignOutButton />
            </>
          }
        >
          {children}
        </AppShell>
      </ClinicProvider>
    </AmplifyProvider>
  );
}
