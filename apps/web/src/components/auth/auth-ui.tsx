"use client";

import { cloneElement, useId } from "react";
import { CircleAlert, Info } from "lucide-react";
import { Button, cn } from "@/components/ui";

/**
 * Auth form pieces from `Muxaris Auth.dc.html`. The kit's Field (13px label, gap 6) and Notice
 * (13.5px, r10, no border on info) do not carry the auth sizes, so they live here.
 */

export const PASSWORD_HELPER = "At least 8 characters, with upper and lower case and a number.";

/** The six-digit code field: 56px, Geist Mono 22px with wide tracking. */
export const CODE_INPUT_CLASS = "h-[56px] px-[16px] text-[22px] tracking-[0.4em]";

/** Label 14px/500 ink, gap 8; optional right-hand action (Forgot password?) and 13px helper. */
export function AuthField({
  label,
  action,
  helper,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  helper?: string;
  children: React.ReactElement<{ id?: string; "aria-describedby"?: string }>;
}) {
  const id = useId();
  const helperId = helper ? `${id}-help` : undefined;
  return (
    <div className="flex flex-col gap-[8px]">
      {action ? (
        <span className="flex items-baseline justify-between">
          <label htmlFor={id} className="text-ink text-[14px] font-medium">
            {label}
          </label>
          {action}
        </span>
      ) : (
        <label htmlFor={id} className="text-ink text-[14px] font-medium">
          {label}
        </label>
      )}
      {cloneElement(children, { id, "aria-describedby": helperId })}
      {helper ? (
        <span id={helperId} className="text-muted text-[13px]">
          {helper}
        </span>
      ) : null}
    </div>
  );
}

/** Notice (teal, role=status) or error (rose, role=alert) box above the form. */
export function AuthMessage({
  tone,
  children,
}: {
  tone: "info" | "error";
  children: React.ReactNode;
}) {
  const Icon = tone === "error" ? CircleAlert : Info;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-[10px] rounded-12 border px-[14px] py-[12px] text-[14px] leading-[1.5]",
        tone === "error"
          ? "bg-rose-soft border-rose-line text-rose-deep"
          : "bg-teal-soft border-teal-line text-teal-deep",
      )}
    >
      <Icon size={16} aria-hidden="true" className="mt-[2px] flex-none" />
      <span>{children}</span>
    </div>
  );
}

/** The 50px ink submit button with its deeper drop shadow; "One moment…" while busy. */
export function SubmitButton({
  busy,
  disabled,
  children,
}: {
  busy: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="submit"
      size={48}
      block
      disabled={busy || disabled}
      className="mt-[4px] h-[50px] text-[15.5px] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_10px_24px_-12px_rgba(12,18,32,0.55)]"
    >
      {busy ? "One moment…" : children}
    </Button>
  );
}

/** "Send a new code": centred teal text button. */
export function ResendButton({
  busy,
  disabled,
  onClick,
}: {
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost-teal"
      onClick={onClick}
      disabled={busy || disabled}
      className="hover:text-ink h-auto self-center p-[4px] text-[14.5px] hover:bg-transparent"
    >
      {busy ? "Sending…" : "Send a new code"}
    </Button>
  );
}
