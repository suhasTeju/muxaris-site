import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { CallbackHandler } from "@/components/auth/callback-handler";

export const metadata: Metadata = { title: "Signing in" };

export default function CallbackPage() {
  return (
    <AuthShell title="One moment">
      <Suspense>
        <CallbackHandler />
      </Suspense>
    </AuthShell>
  );
}
