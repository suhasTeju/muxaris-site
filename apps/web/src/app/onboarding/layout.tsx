import { redirect } from "next/navigation";
import { currentNextPath, getServerMe, getServerToken } from "@/lib/api-server";
import { authConfigured } from "@/lib/amplify";
import { AmplifyProvider } from "@/components/auth/amplify-provider";
import { OnboardingFrame } from "@/components/onboarding/Frame";

export const dynamic = "force-dynamic";

async function toSignIn(): Promise<never> {
  redirect(`/sign-in?next=${encodeURIComponent(await currentNextPath())}`);
}

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  if (!authConfigured || !(await getServerToken())) await toSignIn();
  const me = await getServerMe();
  return (
    <AmplifyProvider>
      <OnboardingFrame email={me.user.email}>{children}</OnboardingFrame>
    </AmplifyProvider>
  );
}
