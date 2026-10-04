"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { confirmSignUp, resendSignUpCode } from "aws-amplify/auth";
import { authErrorMessage } from "@/lib/auth-errors";
import { verifyEmail } from "@/lib/client-store";
import { Field, FormError, FormNotice, PrimaryButton } from "./auth-shell";

export function VerifyForm() {
  const router = useRouter();
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
      await confirmSignUp({ username: email.trim(), confirmationCode: code.trim() });
      router.push("/sign-in?verified=1");
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
      await resendSignUpCode({ username: email.trim() });
      setNotice("We sent a new code. It can take a minute to arrive.");
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setResending(false);
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
        disabled={!email || resending}
        className="text-accent-deep focus-visible:ring-accent-soft w-full rounded text-sm outline-none hover:underline focus-visible:ring-4 disabled:opacity-50"
      >
        {resending ? "Sending…" : "Send a new code"}
      </button>
    </form>
  );
}
