import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <AuthShell
      title="Welcome back"
      aside="Your calls are in good hands."
      footer={
        <>
          New to Muxaris?{" "}
          <Link
            href="/sign-up"
            className="text-accent-deep focus-visible:ring-accent-soft rounded outline-none hover:underline focus-visible:ring-4"
          >
            Create an account
          </Link>
        </>
      }
    >
      <Suspense>
        <SignInForm />
      </Suspense>
    </AuthShell>
  );
}
