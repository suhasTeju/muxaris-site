import Link from "next/link";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { VerifyPreview } from "../previews";
import { q, type Query } from "../query";

/** /dev/auth/verify · ?state=error|resent */
export default async function Preview({ searchParams }: { searchParams: Query }) {
  const p = await searchParams;
  return (
    <AuthShell
      configured
      title="Check your inbox"
      aside="We sent you a confirmation code."
      footer={
        <Link href="/dev/auth/sign-in" className="font-semibold">
          Back to sign in
        </Link>
      }
    >
      <Suspense>
        <VerifyPreview state={q(p, "state")} />
      </Suspense>
    </AuthShell>
  );
}
