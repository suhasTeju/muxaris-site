"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { getCurrentUser, signIn } from "aws-amplify/auth";
import { authErrorMessage, authErrorName, safeNext } from "@/lib/auth-errors";
import { Field, FormError, PrimaryButton } from "./auth-shell";
import { GoogleButton } from "./google-button";

export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function done() {
    router.replace(next);
    router.refresh();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await signIn({ username: email.trim(), password });
      if (res.nextStep.signInStep === "CONFIRM_SIGN_UP") {
        router.push(`/verify?email=${encodeURIComponent(email.trim())}`);
        return;
      }
      if (res.isSignedIn) return done();
      setError(`Additional step required: ${res.nextStep.signInStep}`);
    } catch (err) {
      const name = authErrorName(err);
      if (name === "UserNotConfirmedException") {
        router.push(`/verify?email=${encodeURIComponent(email.trim())}`);
        return;
      }
      if (name === "UserAlreadyAuthenticatedException") {
        await getCurrentUser().catch(() => null);
        return done();
      }
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <GoogleButton onError={(err) => setError(authErrorMessage(err))} />
      <Field
        label="Email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Field
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <div className="text-right text-sm">
        <Link href="/forgot-password" className="text-accent-deep hover:underline">
          Forgot password?
        </Link>
      </div>
      <FormError message={error} />
      <PrimaryButton type="submit" busy={busy}>
        Sign in
      </PrimaryButton>
    </form>
  );
}
