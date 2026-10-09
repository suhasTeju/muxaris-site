"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { buttonClass } from "@/components/ui/Button";

const noop = () => () => {};
const hasSession = () => document.cookie.includes("CognitoIdentityServiceProvider");

/**
 * "Try it live" is shown only when an Amplify session cookie is present. `signedIn` overrides
 * the cookie check (dev previews).
 */
export function TryLive({ signedIn }: { signedIn?: boolean }) {
  const fromCookie = useSyncExternalStore(noop, hasSession, () => false);
  if (!(signedIn ?? fromCookie)) return null;
  return (
    <>
      <Link
        href="/app/assistant/try"
        className={buttonClass({
          variant: "secondary",
          size: 52,
          className: "px-[22px] font-semibold bg-[rgba(255,255,255,0.8)] hover:bg-surface",
        })}
      >
        Try it live
      </Link>
      <span className="text-muted text-[14px]">Talks to your own clinic set-up.</span>
    </>
  );
}
