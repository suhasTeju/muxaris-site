import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { VerifyForm } from "@/components/auth/verify-form";

export const metadata: Metadata = { title: "Confirm your email" };

export default function VerifyPage() {
  return (
    <AuthShell
      title="Check your inbox"
      aside="We sent you a confirmation code."
      footer={
        <Link href="/sign-in" className="font-semibold">
          Back to sign in
        </Link>
      }
    >
      <Suspense>
        <VerifyForm />
      </Suspense>
    </AuthShell>
  );
}
