"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { confirmSignUp, resendSignUpCode } from "aws-amplify/auth";
import { Input } from "@/components/ui";
import { authErrorMessage, safeNext } from "@/lib/auth-errors";
import { verifyEmail } from "@/lib/client-store";
import { AuthField, AuthMessage, CODE_INPUT_CLASS, ResendButton, SubmitButton } from "./auth-ui";

/** The Amplify calls the verify form makes; previews pass stubs. */
export interface VerifyAuth {
  confirmSignUp: typeof confirmSignUp;
  resendSignUpCode: typeof resendSignUpCode;
}

const AMPLIFY: VerifyAuth = { confirmSignUp, resendSignUpCode };

export function VerifyForm({ auth = AMPLIFY }: { auth?: VerifyAuth }) {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [email, setEmail] = useState(() => verifyEmail.get() ?? "");
  const [resending, setResending] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await auth.confirmSignUp({ username: email.trim(), confirmationCode: code.trim() });
      verifyEmail.clear();
      router.push(
        `/sign-in?verified=1${next === "/app" ? "" : `&next=${encodeURIComponent(next)}`}`,
      );
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (resending) return;
    setResending(true);
    setError(null);
    setNotice(null);
    try {
      await auth.resendSignUpCode({ username: email.trim() });
      setNotice("We sent a new code. It can take a minute to arrive.");
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setResending(false);
    }
  }

  return (
    <>
      {notice ? <AuthMessage tone="info">{notice}</AuthMessage> : null}
      {error ? <AuthMessage tone="error">{error}</AuthMessage> : null}
      <form onSubmit={onSubmit} className="flex flex-col gap-[18px]">
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
        <AuthField label="Confirmation code">
          <Input
            size={48}
            soft
            mono
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="••••••"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={CODE_INPUT_CLASS}
          />
        </AuthField>
        <SubmitButton busy={busy}>Confirm email</SubmitButton>
        <ResendButton busy={resending} disabled={!email} onClick={() => void resend()} />
      </form>
    </>
  );
}
