import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpPreview } from "../previews";
import { q, type Query } from "../query";

/** /dev/auth/sign-up · ?google=0 · ?state=error */
export default async function Preview({ searchParams }: { searchParams: Query }) {
  const p = await searchParams;
  return (
    <AuthShell
      configured
      title="Let’s set up your front desk"
      aside="It takes about five minutes."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/dev/auth/sign-in" className="font-semibold">
            Sign in
          </Link>
        </>
      }
    >
      <SignUpPreview state={q(p, "state")} google={q(p, "google") !== "0"} />
    </AuthShell>
  );
}
