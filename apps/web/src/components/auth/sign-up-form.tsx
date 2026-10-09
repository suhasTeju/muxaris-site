"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signInWithRedirect, signUp } from "aws-amplify/auth";
import { Input } from "@/components/ui";
import { googleEnabled } from "@/lib/amplify";
import { authErrorMessage } from "@/lib/auth-errors";
import { verifyEmail } from "@/lib/client-store";
import { AuthField, AuthMessage, PASSWORD_HELPER, SubmitButton } from "./auth-ui";
import { GoogleButton } from "./google-button";

/** The Amplify calls the sign-up form makes; previews pass stubs. */
export interface SignUpAuth {
  signUp: typeof signUp;
  signInWithRedirect: (input: { provider: "Google" }) => Promise<void>;
  googleEnabled: boolean;
}

const AMPLIFY: SignUpAuth = { signUp, signInWithRedirect, googleEnabled };

export function SignUpForm({ auth = AMPLIFY }: { auth?: SignUpAuth }) {
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
      await auth.signUp({ username, password, options: { userAttributes: { email: username } } });
      verifyEmail.set(username);
      router.push("/verify");
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error ? <AuthMessage tone="error">{error}</AuthMessage> : null}
      <form onSubmit={onSubmit} className="flex flex-col gap-[18px]">
        <GoogleButton
          enabled={auth.googleEnabled}
          redirect={auth.signInWithRedirect}
          onError={(err) => setError(authErrorMessage(err))}
        />
        <AuthField label="Work email">
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
        <AuthField label="Password" helper={PASSWORD_HELPER}>
          <Input
            size={48}
            soft
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </AuthField>
        <SubmitButton busy={busy}>Create account</SubmitButton>
      </form>
    </>
  );
}
