"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";

export interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
  /** Next 16.3+: re-fetches server components before re-rendering; preferred over `reset`. */
  retry?: () => void;
}

const SECONDARY =
  "text-muted hover:text-ink rounded-8 text-[14px] underline underline-offset-4 outline-none focus-visible:shadow-focus";

/**
 * Branded recovery panel shared by every error boundary, in the 404 page's type and colour. No
 * dead ends: retry, and go home (public pages) or sign out (inside the app). `fullScreen` fills
 * the viewport with the paper background and teal bloom, for boundaries that replace a whole page.
 */
export function ErrorPanel({
  error,
  reset,
  retry,
  signOut = false,
  fullScreen = false,
  title = "Something went wrong",
  className = "",
}: ErrorBoundaryProps & {
  signOut?: boolean;
  fullScreen?: boolean;
  title?: string;
  className?: string;
}) {
  const panel = (
    <div
      role="alert"
      className={cn(
        "relative mx-auto flex max-w-[460px] animate-[mxIn8_.3s_ease_both] flex-col items-center gap-[18px] px-[16px] py-[64px] text-center motion-reduce:animate-none",
        fullScreen && "py-0",
        className,
      )}
    >
      <span className="text-teal-ink font-mono text-[13px] tracking-[0.12em]">Muxaris</span>
      <h1 className="m-0 text-[36px] leading-[1.05] font-semibold tracking-[-0.04em] sm:text-[48px]">
        {title}
      </h1>
      <p className="text-muted m-0 text-[17px] leading-[1.6]">
        This is on our side, not yours. Try again in a moment; if it keeps happening, email
        hello@muxaris.com
        {error.digest ? ` and quote reference ${error.digest}` : ""}.
      </p>
      <div className="mt-[8px] flex flex-wrap items-center justify-center gap-[20px]">
        <Button size={52} onClick={() => (retry ?? reset)()} className="shadow-none">
          Try again
        </Button>
        {signOut ? (
          <Link href="/sign-in?reason=signout" className={SECONDARY}>
            Sign out
          </Link>
        ) : (
          <Link href="/" className={SECONDARY}>
            Go to the home page
          </Link>
        )}
      </div>
    </div>
  );
  if (!fullScreen) return panel;
  return (
    <main className="bg-paper relative grid min-h-[100dvh] place-items-center overflow-hidden p-[32px]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(40% 50% at 50% 30%,rgba(14,154,150,0.14),transparent 70%)",
        }}
      />
      {panel}
    </main>
  );
}
