"use client";

import { signInWithRedirect } from "aws-amplify/auth";
import { googleEnabled } from "@/lib/amplify";
import { SecondaryButton } from "./auth-shell";

export function GoogleButton({ onError }: { onError: (e: unknown) => void }) {
  if (!googleEnabled) return null;
  return (
    <>
      <SecondaryButton
        type="button"
        onClick={() => signInWithRedirect({ provider: "Google" }).catch(onError)}
      >
        Continue with Google
      </SecondaryButton>
      <div className="text-muted flex items-center gap-3 text-xs uppercase">
        <span className="bg-line h-px flex-1" />
        or
        <span className="bg-line h-px flex-1" />
      </div>
    </>
  );
}
