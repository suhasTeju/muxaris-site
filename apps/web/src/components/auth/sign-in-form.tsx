"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signIn, signOut, signInWithRedirect } from "aws-amplify/auth";
import { Input } from "@/components/ui";
import { authErrorMessage, authErrorName, safeNext, signInStepMessage } from "@/lib/auth-errors";
import { googleEnabled } from "@/lib/amplify";
import { verifyEmail } from "@/lib/client-store";
import { AuthField, AuthMessage, SubmitButton } from "./auth-ui";
import { GoogleButton } from "./google-button";

/** The Amplify calls the sign-in form makes; previews pass stubs. */
export interface SignInAuth {
  signIn: typeof signIn;
  signOut: typeof signOut;
  signInWithRedirect: (input: { provider: "Google" }) => Promise<void>;
  googleEnabled: boolean;
}

const AMPLIFY: SignInAuth = { signIn, signOut, signInWithRedirect, googleEnabled };

export function SignInForm({ auth = AMPLIFY }: { auth?: SignInAuth }) {
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
    auth
      .signOut()
      .catch(() => undefined)
      .finally(() => setCleared(true));
  }, [clearing, auth]);
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
      const res = await auth.signIn({ username: email.trim(), password });
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
      <p role="status" className="text-ink-2 m-0 text-[15px]">
        One moment…
      </p>
    );
  }

  return (
    <>
      {notice ? <AuthMessage tone="info">{notice}</AuthMessage> : null}
      {error ? <AuthMessage tone="error">{error}</AuthMessage> : null}
      <form onSubmit={onSubmit} className="flex flex-col gap-[18px]">
        <GoogleButton
          next={next}
          enabled={auth.googleEnabled}
          redirect={auth.signInWithRedirect}
          onError={(err) => setError(authErrorMessage(err))}
        />
        <AuthField label="Email">
          <Input
            size={48}
            soft
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </AuthField>
        <AuthField
          label="Password"
          action={
            <Link href="/forgot-password" className="text-[13.5px] font-medium">
              Forgot password?
            </Link>
          }
        >
          <Input
            size={48}
            soft
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </AuthField>
        <SubmitButton busy={busy}>Sign in</SubmitButton>
      </form>
    </>
  );
}
