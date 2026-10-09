"use client";

import { useState } from "react";
import { signInWithRedirect } from "aws-amplify/auth";
import { Button } from "@/components/ui";
import { googleEnabled } from "@/lib/amplify";
import { pendingNext } from "@/lib/client-store";

/** "Continue with Google" and the "or" rule under it; renders nothing unless Google is enabled. */
export function GoogleButton({
  onError,
  next,
  enabled = googleEnabled,
  redirect = signInWithRedirect,
}: {
  onError: (e: unknown) => void;
  next?: string;
  /** Defaults to NEXT_PUBLIC_GOOGLE_ENABLED=1 at build time. */
  enabled?: boolean;
  /** Amplify's signInWithRedirect; injectable for previews. */
  redirect?: (input: { provider: "Google" }) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  if (!enabled) return null;
  return (
    <>
      <Button
        variant="secondary"
        size={48}
        block
        disabled={busy}
        className="font-semibold"
        onClick={() => {
          setBusy(true);
          if (next) pendingNext.set(next);
          redirect({ provider: "Google" }).catch((e) => {
            setBusy(false);
            onError(e);
          });
        }}
      >
        {busy ? "Redirecting…" : "Continue with Google"}
      </Button>
      <div className="text-muted flex items-center gap-[12px] font-mono text-[11px] tracking-[0.1em] uppercase">
        <span className="bg-line h-px flex-1" />
        or
        <span className="bg-line h-px flex-1" />
      </div>
    </>
  );
}
