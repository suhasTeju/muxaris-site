"use client";

import { useState } from "react";
import { signInWithRedirect } from "aws-amplify/auth";
import { googleEnabled } from "@/lib/amplify";
import { pendingNext } from "@/lib/client-store";
import { SecondaryButton } from "./auth-shell";

export function GoogleButton({ onError, next }: { onError: (e: unknown) => void; next?: string }) {
  const [busy, setBusy] = useState(false);
  if (!googleEnabled) return null;
  return (
    <>
      <SecondaryButton
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          if (next) pendingNext.set(next);
          signInWithRedirect({ provider: "Google" }).catch((e) => {
            setBusy(false);
            onError(e);
          });
        }}
      >
        {busy ? "Redirecting…" : "Continue with Google"}
      </SecondaryButton>
      <div className="text-muted flex items-center gap-3 text-xs uppercase">
        <span className="bg-line h-px flex-1" />
        or
        <span className="bg-line h-px flex-1" />
      </div>
    </>
  );
}
