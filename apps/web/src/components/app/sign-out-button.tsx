"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signOut } from "aws-amplify/auth";
import { CLINIC_COOKIE } from "@/lib/clinic";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function onClick() {
    setBusy(true);
    try {
      await signOut();
    } finally {
      document.cookie = `${CLINIC_COOKIE}=; path=/; max-age=0; samesite=lax`;
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
