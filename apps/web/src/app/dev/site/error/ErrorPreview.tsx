"use client";

import { ErrorPanel } from "@/components/errors/ErrorPanel";

const error = Object.assign(new Error("Preview error"), { digest: "1234567890" });

/** The error boundary's panel; "Try again" does nothing here. */
export function ErrorPreview({ signOut }: { signOut: boolean }) {
  return <ErrorPanel error={error} reset={() => {}} signOut={signOut} fullScreen={!signOut} />;
}
