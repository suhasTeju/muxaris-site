import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpForm } from "@/components/auth/sign-up-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <AuthShell
      title="Let’s set up your front desk"
      aside="It takes about five minutes."
      footer={
        <>
          Already have an account?{" "}
          <Link
            href="/sign-in"
            className="text-accent-deep focus-visible:ring-accent-soft rounded outline-none hover:underline focus-visible:ring-4"
          >
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm />
    </AuthShell>
  );
}
