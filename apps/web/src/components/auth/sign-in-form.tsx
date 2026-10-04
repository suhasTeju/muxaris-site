"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signIn, signOut } from "aws-amplify/auth";
import { authErrorMessage, authErrorName, safeNext, signInStepMessage } from "@/lib/auth-errors";
import { verifyEmail } from "@/lib/client-store";
import { Field, FormError, FormNotice, PrimaryButton } from "./auth-shell";
import { GoogleButton } from "./google-button";

export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The API rejected the session (or the user asked to sign out): clear any stale Amplify session
  // before the form shows, otherwise UserAlreadyAuthenticated would bounce back to /app forever.
  const reason = params.get("reason");
  const clearing = reason === "session" || reason === "signout";
  const [cleared, setCleared] = useState(!clearing);
  const started = useRef(false);
  useEffect(() => {
    if (!clearing || started.current) return;
    started.current = true;
    signOut()
      .catch(() => undefined)
      .finally(() => setCleared(true));
  }, [clearing]);
  const notice =
    reason === "session"
      ? "Your session expired. Please sign in again."
      : params.get("verified")
        ? "Email confirmed. Sign in to continue."
        : params.get("reset")
          ? "Password updated. Sign in with your new password."
          : null;

  function done() {
    router.replace(next);
    router.refresh();
  }
  function toVerify() {
    verifyEmail.set(email.trim());
    router.push(next === "/app" ? "/verify" : `/verify?next=${encodeURIComponent(next)}`);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await signIn({ username: email.trim(), password });
      if (res.nextStep.signInStep === "CONFIRM_SIGN_UP") return toVerify();
      if (res.isSignedIn) return done();
      setError(signInStepMessage(res.nextStep.signInStep));
    } catch (err) {
      const name = authErrorName(err);
      if (name === "UserNotConfirmedException") return toVerify();
      if (name === "UserAlreadyAuthenticatedException") return done();
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!cleared) {
    return (
      <p role="status" className="text-muted text-sm">
        One moment…
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormNotice message={notice} />
      <GoogleButton next={next} onError={(err) => setError(authErrorMessage(err))} />
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
        <Link
          href="/forgot-password"
          className="text-accent-deep focus-visible:ring-accent-soft rounded outline-none hover:underline focus-visible:ring-4"
        >
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
