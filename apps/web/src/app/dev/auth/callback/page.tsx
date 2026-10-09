import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { CallbackPreview } from "../previews";

/** /dev/auth/callback (signing in) · ?error=access_denied (Google sign-in failed) */
export default function Preview() {
  return (
    <AuthShell configured title="One moment">
      <Suspense>
        <CallbackPreview />
      </Suspense>
    </AuthShell>
  );
}
