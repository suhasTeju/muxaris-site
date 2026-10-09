import Link from "next/link";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignInPreview } from "../previews";
import { q, type Query } from "../query";

/**
 * /dev/auth/sign-in · ?google=0 · ?state=error|busy|unconfigured
 * · ?verified=1 · ?reset=1 · ?reason=session (the form reads these itself)
 */
export default async function Preview({ searchParams }: { searchParams: Query }) {
  const p = await searchParams;
  const state = q(p, "state");
  return (
    <AuthShell
      title="Welcome back"
      aside="Your calls are in good hands."
      configured={state !== "unconfigured"}
      footer={
        <>
          New to Muxaris?{" "}
          <Link href="/dev/auth/sign-up" className="font-semibold">
            Create an account
          </Link>
        </>
      }
    >
      <Suspense>
        <SignInPreview state={state} google={q(p, "google") !== "0"} />
      </Suspense>
    </AuthShell>
  );
}
