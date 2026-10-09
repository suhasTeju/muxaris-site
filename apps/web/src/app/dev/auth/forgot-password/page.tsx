import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPreview } from "../previews";
import { q, type Query } from "../query";

/** /dev/auth/forgot-password · ?state=code (second step) · ?state=error */
export default async function Preview({ searchParams }: { searchParams: Query }) {
  const p = await searchParams;
  return (
    <AuthShell
      configured
      title="Reset your password"
      aside="It happens to everyone."
      footer={
        <Link href="/dev/auth/sign-in" className="font-semibold">
          Back to sign in
        </Link>
      }
    >
      <ForgotPreview state={q(p, "state")} />
    </AuthShell>
  );
}
