"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { confirmSignUp, resendSignUpCode } from "aws-amplify/auth";
import { authErrorMessage } from "@/lib/auth-errors";
import { Field, FormError, FormNotice, PrimaryButton } from "./auth-shell";

export function VerifyForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
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
      await confirmSignUp({ username: email.trim(), confirmationCode: code.trim() });
      router.push(`/sign-in?verified=1`);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    setNotice(null);
    try {
      await resendSignUpCode({ username: email.trim() });
      setNotice("We sent a new code. It can take a minute to arrive.");
    } catch (err) {
      setError(authErrorMessage(err));
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field
        label="Email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Field
        label="Confirmation code"
        inputMode="numeric"
        autoComplete="one-time-code"
        required
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <FormError message={error} />
      <FormNotice message={notice} />
      <PrimaryButton type="submit" busy={busy}>
        Confirm email
      </PrimaryButton>
      <button
        type="button"
        onClick={resend}
        disabled={!email}
        className="text-accent-deep w-full text-sm hover:underline disabled:opacity-50"
      >
        Send a new code
      </button>
    </form>
  );
}
