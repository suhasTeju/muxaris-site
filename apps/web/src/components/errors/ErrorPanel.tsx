"use client";

import Link from "next/link";

export interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
  /** Next 16.3+: re-fetches server components before re-rendering; preferred over `reset`. */
  retry?: () => void;
}

/** Branded recovery panel shared by every error boundary. No dead ends: retry, and optionally sign out. */
export function ErrorPanel({
  error,
  reset,
  retry,
  signOut = false,
  title = "Something went wrong",
  className = "",
}: ErrorBoundaryProps & { signOut?: boolean; title?: string; className?: string }) {
  return (
    <div
      role="alert"
      className={`mx-auto flex max-w-lg flex-col items-start gap-4 px-6 py-16 ${className}`}
    >
      <p className="font-display text-accent-deep text-lg italic">Muxaris</p>
      <h1 className="font-display text-3xl leading-tight">{title}</h1>
      <p className="text-muted">
        This is on our side, not yours. Try again in a moment; if it keeps happening, email
        hello@muxaris.com
        {error.digest ? ` and quote reference ${error.digest}` : ""}.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => (retry ?? reset)()}
          className="bg-accent hover:bg-accent-deep focus-visible:ring-accent-soft text-on-accent rounded-lg px-5 py-2.5 font-medium transition-colors outline-none focus-visible:ring-4"
        >
          Try again
        </button>
        {signOut ? (
          <Link
            href="/sign-in?reason=signout"
            className="text-muted hover:text-ink focus-visible:ring-accent-soft rounded text-sm underline underline-offset-4 outline-none focus-visible:ring-4"
          >
            Sign out
          </Link>
        ) : (
          <Link
            href="/"
            className="text-muted hover:text-ink focus-visible:ring-accent-soft rounded text-sm underline underline-offset-4 outline-none focus-visible:ring-4"
          >
            Go to the home page
          </Link>
        )}
      </div>
    </div>
  );
}
