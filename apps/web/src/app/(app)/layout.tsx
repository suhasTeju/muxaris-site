import Image from "next/image";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { currentNextPath, getActiveClinic, getServerMe, getServerToken } from "@/lib/api-server";
import { authConfigured } from "@/lib/amplify";
import { ClinicProvider } from "@/components/app/clinic-context";
import { ClinicSwitcher } from "@/components/app/clinic-switcher";
import { SignOutButton } from "@/components/app/sign-out-button";

export const dynamic = "force-dynamic";

async function toSignIn(): Promise<never> {
  redirect(`/sign-in?next=${encodeURIComponent(await currentNextPath())}`);
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!authConfigured || !(await getServerToken())) await toSignIn();

  let me;
  try {
    me = await getServerMe();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) await toSignIn();
    throw err;
  }
  const active = await getActiveClinic();
  if (!active) redirect("/onboarding");

  const clinics = me!.memberships.map((m) => ({
    id: m.clinicId,
    name: m.clinic.name,
    role: m.role,
  }));

  return (
    <ClinicProvider clinics={clinics} activeId={active.clinicId} cookieStale={active.cookieStale}>
      <div className="flex min-h-screen flex-col">
        <header className="border-line bg-surface flex items-center justify-between gap-4 border-b px-6 py-3">
          <div className="flex items-center gap-6">
            <Image
              src="/brand/muxaris-wordmark.svg"
              alt="Muxaris"
              width={110}
              height={29}
              priority
            />
            <ClinicSwitcher />
          </div>
          <div className="flex items-center gap-4">
            <span className="text-muted hidden text-sm sm:inline">{me!.user.email}</span>
            <SignOutButton />
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </ClinicProvider>
  );
}
