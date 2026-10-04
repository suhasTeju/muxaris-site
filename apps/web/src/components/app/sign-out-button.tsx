"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signOut } from "aws-amplify/auth";
import { clearClinicCookie } from "@/lib/clinic";
import { clearClientStore } from "@/lib/client-store";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function onClick() {
    setBusy(true);
    try {
      // Global sign-out revokes the refresh token server-side; fall back to local if that fails.
      try {
        await signOut({ global: true });
      } catch {
        await signOut();
      }
    } catch {
      /* the local session is cleared below regardless */
    } finally {
      clearClinicCookie();
      clearClientStore();
      router.replace("/sign-in");
      router.refresh();
    }
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="text-muted hover:text-ink focus-visible:ring-accent-soft rounded text-sm underline-offset-4 outline-none hover:underline focus-visible:ring-4 disabled:opacity-60"
    >
      Sign out
    </button>
  );
}
