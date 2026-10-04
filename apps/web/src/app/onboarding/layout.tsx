import Image from "next/image";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { currentNextPath, getServerMe, getServerToken } from "@/lib/api-server";
import { authConfigured } from "@/lib/amplify";
import { SignOutButton } from "@/components/app/sign-out-button";

export const dynamic = "force-dynamic";

async function toSignIn(): Promise<never> {
  redirect(`/sign-in?next=${encodeURIComponent(await currentNextPath())}`);
}

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  if (!authConfigured || !(await getServerToken())) await toSignIn();
  let me;
  try {
    me = await getServerMe();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) await toSignIn();
    throw err;
  }
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-line bg-surface flex items-center justify-between gap-4 border-b px-6 py-3">
        <Image src="/brand/muxaris-wordmark.svg" alt="Muxaris" width={110} height={29} priority />
        <div className="flex items-center gap-4">
          <span className="text-muted hidden text-sm sm:inline">{me!.user.email}</span>
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">{children}</main>
    </div>
  );
}
