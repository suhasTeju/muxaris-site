"use client";

import { useEffect, useMemo, useRef } from "react";
import { CallbackHandler, type CallbackAuth } from "@/components/auth/callback-handler";
import { ForgotPasswordForm, type ResetAuth } from "@/components/auth/forgot-password-form";
import { SignInForm, type SignInAuth } from "@/components/auth/sign-in-form";
import { SignUpForm, type SignUpAuth } from "@/components/auth/sign-up-form";
import { VerifyForm, type VerifyAuth } from "@/components/auth/verify-form";

/**
 * Client halves of the /dev/auth previews: the real forms with their Amplify calls stubbed, and a
 * small driver that fills the fields and submits so error and second-step states render on load.
 */

const pending = () => new Promise<never>(() => undefined);
const ok = async () => undefined;
function cognito(name: string, message = name): Error {
  return Object.assign(new Error(message), { name });
}
const reject = (name: string) => async (): Promise<never> => {
  throw cognito(name);
};

function setInput(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Fills the inputs in order, then submits the form or clicks a button by its text. */
function Drive({
  values = [],
  submit = false,
  click,
  children,
}: {
  values?: string[];
  submit?: boolean;
  click?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const plan = useRef({ values, submit, click });
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const { values: vals, submit: doSubmit, click: label } = plan.current;
    root.querySelectorAll("input").forEach((el, i) => {
      if (vals[i] !== undefined) setInput(el, vals[i]);
    });
    const t = setTimeout(() => {
      if (doSubmit) root.querySelector("form")?.requestSubmit();
      if (label)
        Array.from(root.querySelectorAll("button"))
          .find((b) => b.textContent === label)
          ?.click();
    }, 60);
    return () => clearTimeout(t);
  }, []);
  return (
    <div ref={ref} className="contents">
      {children}
    </div>
  );
}

const EMAIL = "owner@example.com";

export function SignInPreview({ state, google }: { state: string; google: boolean }) {
  const auth = useMemo<SignInAuth>(
    () => ({
      signIn:
        state === "busy" ? pending : state === "error" ? reject("NotAuthorizedException") : pending,
      signOut: ok,
      signInWithRedirect: pending,
      googleEnabled: google,
    }),
    [state, google],
  );
  if (state === "error" || state === "busy")
    return (
      <Drive values={[EMAIL, "not-my-password"]} submit>
        <SignInForm auth={auth} />
      </Drive>
    );
  return <SignInForm auth={auth} />;
}

export function SignUpPreview({ state, google }: { state: string; google: boolean }) {
  const auth = useMemo<SignUpAuth>(
    () => ({
      signUp: state === "error" ? reject("InvalidPasswordException") : pending,
      signInWithRedirect: pending,
      googleEnabled: google,
    }),
    [state, google],
  );
  if (state === "error")
    return (
      <Drive values={[EMAIL, "password"]} submit>
        <SignUpForm auth={auth} />
      </Drive>
    );
  return <SignUpForm auth={auth} />;
}

export function VerifyPreview({ state }: { state: string }) {
  const auth = useMemo<VerifyAuth>(
    () => ({
      confirmSignUp: state === "error" ? reject("CodeMismatchException") : pending,
      resendSignUpCode: async () => ({ destination: "o***@s***", deliveryMedium: "EMAIL" }),
    }),
    [state],
  );
  if (state === "error")
    return (
      <Drive values={[EMAIL, "123456"]} submit>
        <VerifyForm auth={auth} />
      </Drive>
    );
  if (state === "resent")
    return (
      <Drive values={[EMAIL]} click="Send a new code">
        <VerifyForm auth={auth} />
      </Drive>
    );
  return <VerifyForm auth={auth} />;
}

export function ForgotPreview({ state }: { state: string }) {
  const auth = useMemo<ResetAuth>(
    () => ({
      resetPassword:
        state === "error"
          ? reject("LimitExceededException")
          : async () => ({
              isPasswordReset: false,
              nextStep: {
                resetPasswordStep: "CONFIRM_RESET_PASSWORD_WITH_CODE",
                codeDeliveryDetails: { deliveryMedium: "EMAIL" },
              },
            }),
      confirmResetPassword: pending,
    }),
    [state],
  );
  if (state === "code" || state === "error")
    return (
      <Drive values={[EMAIL]} submit>
        <ForgotPasswordForm auth={auth} />
      </Drive>
    );
  return <ForgotPasswordForm auth={auth} />;
}

const CALLBACK_PENDING: CallbackAuth = { listen: () => () => undefined, hasSession: pending };

export function CallbackPreview() {
  return <CallbackHandler auth={CALLBACK_PENDING} />;
}
