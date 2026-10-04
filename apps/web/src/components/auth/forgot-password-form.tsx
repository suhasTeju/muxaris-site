"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { confirmResetPassword, resetPassword } from "aws-amplify/auth";
import { RESET_SENT_NOTICE, authErrorMessage, resetErrorMessage } from "@/lib/auth-errors";
import { Field, FormError, FormNotice, PrimaryButton } from "./auth-shell";

export function ForgotPasswordForm() {
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
      await resetPassword({ username: email.trim() });
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
      await confirmResetPassword({
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

  if (step === "request") {
    return (
      <form onSubmit={request} className="space-y-4">
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <FormError message={error} />
        <PrimaryButton type="submit" busy={busy}>
          Send reset code
        </PrimaryButton>
      </form>
    );
  }
  return (
    <form onSubmit={confirm} className="space-y-4">
      <FormNotice message={notice} />
      <Field
        label="Code"
        inputMode="numeric"
        autoComplete="one-time-code"
        required
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <Field
        label="New password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <FormError message={error} />
      <PrimaryButton type="submit" busy={busy}>
        Set new password
      </PrimaryButton>
      <button
        type="button"
        disabled={busy}
        onClick={() => request()}
        className="text-accent-deep focus-visible:ring-accent-soft w-full rounded text-sm outline-none hover:underline focus-visible:ring-4 disabled:opacity-50"
      >
        {busy ? "Sending…" : "Send a new code"}
      </button>
    </form>
  );
}
