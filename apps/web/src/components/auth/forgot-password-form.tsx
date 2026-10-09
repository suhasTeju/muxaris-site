"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { confirmResetPassword, resetPassword } from "aws-amplify/auth";
import { Input } from "@/components/ui";
import { RESET_SENT_NOTICE, authErrorMessage, resetErrorMessage } from "@/lib/auth-errors";
import {
  AuthField,
  AuthMessage,
  CODE_INPUT_CLASS,
  PASSWORD_HELPER,
  ResendButton,
  SubmitButton,
} from "./auth-ui";

/** The Amplify calls the reset form makes; previews pass stubs. */
export interface ResetAuth {
  resetPassword: typeof resetPassword;
  confirmResetPassword: typeof confirmResetPassword;
}

const AMPLIFY: ResetAuth = { resetPassword, confirmResetPassword };

export function ForgotPasswordForm({ auth = AMPLIFY }: { auth?: ResetAuth }) {
  const router = useRouter();
  const [step, setStep] = useState<"request" | "confirm">("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function request(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await auth.resetPassword({ username: email.trim() });
      setStep("confirm");
      setNotice(RESET_SENT_NOTICE);
    } catch (err) {
      const msg = resetErrorMessage(err);
      if (msg === null) {
        setStep("confirm");
        setNotice(RESET_SENT_NOTICE);
      } else setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await auth.confirmResetPassword({
        username: email.trim(),
        confirmationCode: code.trim(),
        newPassword: password,
      });
      router.push("/sign-in?reset=1");
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const errorBox = error ? <AuthMessage tone="error">{error}</AuthMessage> : null;

  if (step === "request") {
    return (
      <>
        {errorBox}
        <form onSubmit={request} className="flex flex-col gap-[18px]">
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
          <SubmitButton busy={busy}>Send reset code</SubmitButton>
        </form>
      </>
    );
  }
  return (
    <>
      {notice ? <AuthMessage tone="info">{notice}</AuthMessage> : null}
      {errorBox}
      <form onSubmit={confirm} className="flex flex-col gap-[18px]">
        <AuthField label="Code">
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
        <AuthField label="New password" helper={PASSWORD_HELPER}>
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
        <SubmitButton busy={busy}>Set new password</SubmitButton>
        <ResendButton busy={busy} onClick={() => void request()} />
      </form>
    </>
  );
}
