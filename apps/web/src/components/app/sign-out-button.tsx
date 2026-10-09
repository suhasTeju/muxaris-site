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
      className="border-field bg-surface text-ink hover:bg-paper inline-flex h-[34px] cursor-pointer items-center rounded-9 border px-[12px] text-[13.5px] font-medium whitespace-nowrap disabled:cursor-default disabled:opacity-70"
    >
      Sign out
    </button>
  );
}
