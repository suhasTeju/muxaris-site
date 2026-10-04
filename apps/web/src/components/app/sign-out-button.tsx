"use client";

import { signOut } from "aws-amplify/auth";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut()}
      className="text-muted hover:text-ink text-sm underline-offset-4 hover:underline"
    >
      Sign out
    </button>
  );
}
