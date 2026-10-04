"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

const noop = () => () => {};
const hasSession = () => document.cookie.includes("CognitoIdentityServiceProvider");

/** "Try it live" is shown only when an Amplify session cookie is present. */
export function TryLive() {
  const signedIn = useSyncExternalStore(noop, hasSession, () => false);
  if (!signedIn) return null;
  return (
    <>
      <Link href="/app/assistant/try" className="mx-btn bg-paper text-ink hover:bg-accent-soft">
        Try it live
      </Link>
      <p className="font-display text-dark-muted text-sm italic sm:ml-2 sm:order-last">
        Talks to your own clinic set-up.
      </p>
    </>
  );
}
