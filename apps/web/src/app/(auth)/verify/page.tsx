import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { VerifyForm } from "@/components/auth/verify-form";

export const metadata: Metadata = { title: "Confirm your email" };

export default function VerifyPage() {
  return (
    <AuthShell title="Check your inbox" aside="We sent you a confirmation code.">
      <Suspense>
        <VerifyForm />
      </Suspense>
    </AuthShell>
  );
}
