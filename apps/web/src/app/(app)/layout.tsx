import Image from "next/image";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ApiError, type MeResponse } from "@/lib/api";
import { CLINIC_COOKIE, getServerToken, serverApi } from "@/lib/api-server";
import { authConfigured } from "@/lib/amplify";
import { ClinicProvider } from "@/components/app/clinic-context";
import { ClinicSwitcher } from "@/components/app/clinic-switcher";
import { SignOutButton } from "@/components/app/sign-out-button";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!authConfigured || !(await getServerToken())) redirect("/sign-in");

  let me: MeResponse;
  try {
    me = await serverApi<MeResponse>("/v1/me");
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect("/sign-in");
    throw err;
  }
  if (me.memberships.length === 0) redirect("/onboarding");

  const clinics = me.memberships.map((m) => ({
    id: m.clinicId,
    name: m.clinic.name,
    role: m.role,
  }));
  const saved = (await cookies()).get(CLINIC_COOKIE)?.value;
  const activeId = clinics.find((c) => c.id === saved)?.id ?? clinics[0]!.id;

  return (
    <ClinicProvider clinics={clinics} activeId={activeId}>
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
            <span className="text-muted hidden text-sm sm:inline">{me.user.email}</span>
            <SignOutButton />
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </ClinicProvider>
  );
}
