"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signUp } from "aws-amplify/auth";
import { authErrorMessage } from "@/lib/auth-errors";
import { verifyEmail } from "@/lib/client-store";
import { Field, FormError, PrimaryButton } from "./auth-shell";
import { GoogleButton } from "./google-button";

export function SignUpForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const username = email.trim();
      await signUp({ username, password, options: { userAttributes: { email: username } } });
      verifyEmail.set(username);
      router.push("/verify");
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <GoogleButton onError={(err) => setError(authErrorMessage(err))} />
      <Field
        label="Work email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Field
        label="Password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <p className="text-muted text-xs">
        At least 8 characters, with upper and lower case and a number.
      </p>
      <FormError message={error} />
      <PrimaryButton type="submit" busy={busy}>
        Create account
      </PrimaryButton>
    </form>
  );
}
