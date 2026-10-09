import Link from "next/link";
import { SignOutButton } from "@/components/app/sign-out-button";
import { Wordmark } from "@/components/ui";
import { Progress } from "./Progress";

/**
 * Onboarding chrome from `Muxaris Onboarding.dc.html`: paper with a teal bloom top right, the
 * sticky 64px glass header (wordmark, email, Sign out) and the 1120px content column.
 */
export function OnboardingFrame({ email, children }: { email: string; children: React.ReactNode }) {
  return (
    <div className="bg-paper min-h-screen text-[15px] bg-[radial-gradient(50%_40%_at_85%_0%,rgba(14,154,150,0.10),transparent_70%)]">
      <header className="border-line sticky top-0 z-20 flex h-[64px] items-center justify-between gap-[16px] border-b bg-[rgba(244,246,249,0.78)] px-[16px] backdrop-blur-[16px] sm:px-[28px]">
        <Link href="/" aria-label="Muxaris home" className="flex">
          <Wordmark width={112} />
        </Link>
        {/* The shared Sign out button is 34px; the onboarding header draws it at 36px/r10/14px. */}
        <div className="text-muted flex min-w-0 items-center gap-[16px] text-[14px] [&_button]:h-[36px] [&_button]:rounded-10 [&_button]:px-[14px] [&_button]:text-[14px]">
          <span className="truncate max-sm:hidden">{email}</span>
          <SignOutButton />
        </div>
      </header>
      <div className="mx-auto max-w-[1120px] px-[16px] pt-[24px] pb-[80px] sm:px-[28px] lg:pt-[40px]">
        {children}
      </div>
    </div>
  );
}

/** The rail beside the step column (250px, 40px gap), shared by the wizard and its loading state. */
export function WizardLayout({
  rail,
  children,
  mainRef,
}: {
  rail: React.ReactNode;
  children: React.ReactNode;
  mainRef?: React.Ref<HTMLElement>;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-[24px] lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-[40px]">
      {rail}
      <main ref={mainRef} className="flex max-w-[780px] min-w-0 flex-col gap-[16px]">
        {children}
      </main>
    </div>
  );
}

/** "Loading your setup…" card in the step column. */
export function WizardLoading() {
  return (
    <WizardLayout rail={<Progress step={null} />}>
      <div
        role="status"
        className="bg-surface border-line text-muted rounded-[22px] border p-[40px] text-[15px]"
      >
        Loading your setup…
      </div>
    </WizardLayout>
  );
}
