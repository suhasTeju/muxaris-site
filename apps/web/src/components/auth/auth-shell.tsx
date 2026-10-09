import Image from "next/image";
import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import { Wordmark } from "@/components/ui";
import { authConfigured } from "@/lib/amplify";
import { AuthMessage } from "./auth-ui";

/**
 * Two-pane auth layout from `Muxaris Auth.dc.html`: the form column on the left, the clinic photo
 * with a glass sample-call card on the right (hidden below 1024px, where the design has no layout).
 */
export function AuthShell({
  title,
  aside,
  children,
  footer,
  configured = authConfigured,
}: {
  title: string;
  aside?: string;
  children: React.ReactNode;
  /** The ruled line under the form: "New to Muxaris? Create an account" and friends. */
  footer?: React.ReactNode;
  /** Whether Cognito is configured; defaults to the build's environment. */
  configured?: boolean;
}) {
  return (
    <div className="bg-surface grid min-h-screen grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex min-h-screen flex-col px-[16px] py-[28px] sm:px-[48px]">
        <Link href="/" aria-label="Muxaris home" className="inline-flex self-start">
          <Wordmark width={120} />
        </Link>
        <main className="flex flex-1 items-center justify-center py-[48px]">
          <div className="flex w-full max-w-[400px] animate-[mxIn_.35s_ease_both] flex-col gap-[28px]">
            <div className="flex flex-col gap-[8px]">
              <h1 className="m-0 text-[36px] leading-[1.1] font-semibold tracking-[-0.035em] max-sm:text-[30px]">
                {title}
              </h1>
              <p className="text-muted m-0 text-[16px] italic">{aside}</p>
            </div>
            {configured ? (
              children
            ) : (
              <AuthMessage tone="error">
                Sign-in is not configured for this deployment. Set{" "}
                <code>NEXT_PUBLIC_COGNITO_USER_POOL_ID</code> and{" "}
                <code>NEXT_PUBLIC_COGNITO_CLIENT_ID</code> where the site is built, then rebuild.
              </AuthMessage>
            )}
            {footer ? (
              <p className="border-line text-muted m-0 border-t pt-[20px] text-[14.5px]">
                {footer}
              </p>
            ) : null}
          </div>
        </main>
        <footer className="text-muted flex justify-between gap-[16px] text-[13px]">
          <span>© 2026 Muxaris. All rights reserved.</span>
          <div className="flex gap-[16px]">
            <Link href="/privacy" className="text-muted">
              Privacy
            </Link>
            <Link href="/terms" className="text-muted">
              Terms
            </Link>
          </div>
        </footer>
      </div>
      <SampleCallPane />
    </div>
  );
}

function SampleCallPane() {
  return (
    <div className="hidden min-h-screen p-[16px] lg:block">
      <div className="relative h-full min-h-[calc(100vh-32px)] overflow-hidden rounded-[28px] bg-[#dfe7ec]">
        <Image
          src="/img/hero-clinic.webp"
          alt=""
          fill
          priority
          sizes="52vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(12,18,32,0)_40%,rgba(12,18,32,0.45))]" />
        <div className="text-ink-2 absolute top-[24px] right-[24px] flex items-center gap-[10px] rounded-14 border border-[rgba(255,255,255,0.95)] bg-[rgba(255,255,255,0.8)] px-[14px] py-[10px] text-[13.5px] backdrop-blur-[16px]">
          English · हिन्दी · ಕನ್ನಡ · தமிழ் · తెలుగు
        </div>
        <aside
          aria-label="Sample call"
          className="absolute right-[24px] bottom-[24px] left-[24px] flex max-w-[460px] flex-col gap-[12px] rounded-[22px] border border-[rgba(255,255,255,0.95)] bg-[rgba(255,255,255,0.8)] p-[18px] shadow-[0_30px_60px_-30px_rgba(12,18,32,0.5)] backdrop-blur-[20px]"
        >
          <div className="text-muted flex items-center gap-[10px] font-mono text-[11px] tracking-[0.08em] uppercase">
            <span className="bg-signal size-[8px] animate-[mxPulse10_2s_infinite] rounded-full" />
            Sample call · English
          </div>
          <p className="bg-chip m-0 max-w-[86%] self-end rounded-[14px_14px_4px_14px] px-[14px] py-[10px] text-[14px] leading-[1.5]">
            Hi, I have a bad toothache since last night. Can I see the doctor tomorrow?
          </p>
          <p className="bg-teal-soft border-teal-line m-0 max-w-[86%] rounded-[14px_14px_14px_4px] border px-[14px] py-[10px] text-[14px] leading-[1.5]">
            I’m sorry to hear that. Doctor Rao has a slot tomorrow at four thirty in the afternoon.
            Shall I book it for you?
          </p>
          <div className="flex items-center gap-[12px] rounded-14 border border-[#bfe5cb] bg-[#f0faf3] px-[14px] py-[12px]">
            <span className="bg-green-soft text-green-ink grid size-[32px] flex-none place-items-center rounded-10">
              <CalendarCheck size={16} aria-hidden="true" />
            </span>
            <div className="flex flex-col">
              <span className="text-green-ink font-mono text-[10.5px] tracking-[0.08em] uppercase">
                Booked · Sunrise Dental Care
              </span>
              <span className="text-[14.5px] font-semibold">Doctor Rao, tomorrow, 4:30 pm</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
