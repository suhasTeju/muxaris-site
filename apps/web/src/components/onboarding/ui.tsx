"use client";

import { createContext, useCallback, useContext, useId, useState } from "react";
import { ArrowRight, Check, CircleAlert } from "lucide-react";
import { Button, Input, Select, cn, type InputProps, type SelectProps } from "@/components/ui";
import type { ApiInit } from "@/lib/api";
import { ApiError } from "@/lib/api";

/**
 * Wizard pieces from `Muxaris Onboarding.dc.html`. The kit's Field has a 12px error and shows the
 * hint and the error together; the wizard shows one 12.5px line (the error replaces the hint), and
 * its checkboxes are 18px (16px on doctor chips, 20px in the services table), so they live here.
 */

export type Call = <T>(path: string, init?: ApiInit) => Promise<T>;

export function errMsg(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 403) return "You do not have permission to do that for this clinic.";
    return e.message || "Something went wrong. Please try again.";
  }
  return "Something went wrong. Please try again.";
}

/** Label 13.5px/500 ink-2, gap 7; under the control one 12.5px line: the error, else the hint. */
export function Field({
  label,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  className?: string;
  children: (p: {
    id: string;
    "aria-invalid": boolean;
    "aria-describedby": string | undefined;
  }) => React.ReactNode;
}) {
  const id = useId();
  const note = error ?? hint;
  return (
    <div className={cn("flex min-w-0 flex-col gap-[7px]", className)}>
      <label htmlFor={id} className="text-ink-2 text-[13.5px] font-medium">
        {label}
      </label>
      {children({
        id,
        "aria-invalid": Boolean(error),
        "aria-describedby": note ? `${id}-note` : undefined,
      })}
      {note ? (
        <span id={`${id}-note`} className={cn("text-[12.5px]", error ? "text-rose" : "text-muted")}>
          {note}
        </span>
      ) : null}
    </div>
  );
}

/** 44px text field (15px; Geist Mono 14px with `mono`). `className` sizes the wrapper. */
export function TextField({
  label,
  error,
  hint,
  className,
  ...props
}: { label: string; error?: string | undefined; hint?: string | undefined } & Omit<
  InputProps,
  "id" | "size"
>) {
  return (
    <Field label={label} error={error} hint={hint} className={className}>
      {(a) => <Input size={44} {...a} {...props} />}
    </Field>
  );
}

export function SelectField({
  label,
  error,
  options,
  className,
  ...props
}: {
  label: string;
  error?: string | undefined;
  options: ReadonlyArray<{ value: string; label: string }>;
} & Omit<SelectProps, "id" | "size">) {
  return (
    <Field label={label} error={error} className={className}>
      {(a) => (
        <Select size={44} {...a} {...props}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

/** The design's drawn check box: teal with a white check when on, #c3ccd7 border when off. */
export function CheckBox({ on, size = 18 }: { on: boolean; size?: 16 | 18 | 20 }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid flex-none place-items-center border text-white",
        size === 16 && "size-[16px] rounded-5",
        size === 18 && "size-[18px] rounded-5",
        size === 20 && "size-[20px] rounded-6",
        on ? "border-teal bg-teal" : "border-line-strong bg-surface",
      )}
    >
      <Check
        size={size === 16 ? 11 : size === 18 ? 12 : 13}
        className={on ? "opacity-100" : "opacity-0"}
      />
    </span>
  );
}

/** A checkbox row (working-hours days, same-day bookings): 18px box, 10px gap, no chrome. */
export function CheckRow({
  on,
  onToggle,
  children,
  className,
  disabled,
}: {
  on: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "text-ink flex cursor-pointer items-center gap-[10px] border-0 bg-transparent px-0 py-[4px] text-left text-[14px] disabled:cursor-default",
        className,
      )}
    >
      <CheckBox on={on} />
      {children}
    </button>
  );
}

/** Language toggle chip: 38px (clinic languages) or 34px (a doctor's languages). */
export function LangChip({
  on,
  onToggle,
  label,
  size = 38,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
  size?: 34 | 38;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      onClick={onToggle}
      className={cn(
        "text-ink inline-flex cursor-pointer items-center gap-[8px] border transition-all duration-150 disabled:cursor-default motion-reduce:transition-none",
        size === 38
          ? "h-[38px] rounded-10 pr-[13px] pl-[9px] text-[14px]"
          : "h-[34px] rounded-9 pr-[12px] pl-[8px] text-[13.5px]",
        on ? "border-teal-border bg-[#f0faf9]" : "border-field bg-surface",
      )}
    >
      <CheckBox on={on} size={size === 38 ? 18 : 16} />
      {label}
    </button>
  );
}

/** Rose step error under the card heading (also used for load errors). */
export function StepError({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "bg-rose-soft border-rose-line text-rose-deep flex items-start gap-[10px] rounded-12 border px-[14px] py-[12px] text-[14px]",
        className,
      )}
    >
      <CircleAlert size={16} aria-hidden="true" className="mt-[2px] flex-none" />
      <span>{children}</span>
    </div>
  );
}

/** A failed Back/Edit/rail navigation, shown in the current step's error slot. */
export const NavErrorContext = createContext<string | null>(null);

/** True while a Back/Edit/rail navigation is saving the step; the step's footer waits for it. */
export const NavBusyContext = createContext(false);

/** Lets a step tell the wizard it is saving, so the rail cannot jump mid-save. */
export const StepBusyContext = createContext<(busy: boolean) => void>(() => undefined);

/**
 * A step's busy state (`idle` when nothing runs) that also reports to the wizard. The report is
 * synchronous with the state change, so a rail click right after Continue is already refused.
 */
export function useStepBusy<T>(idle: T) {
  const report = useContext(StepBusyContext);
  const [value, setValue] = useState<T>(idle);
  const set = useCallback(
    (next: T) => {
      report(next !== idle);
      setValue(next);
    },
    [report, idle],
  );
  return [value, set] as const;
}

/** The step card: heading, optional error, body, and the Back / Continue footer. */
export function StepShell({
  title,
  lead,
  error,
  gap = "gap-[22px]",
  children,
  footer,
}: {
  title: string;
  lead?: string;
  error?: string | null;
  /** Body gap class; the design uses 22 (clinic, assistant), 18 (doctors), 24 (services), 12. */
  gap?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const navError = useContext(NavErrorContext);
  const shown = error || navError;
  return (
    <section className="bg-surface border-line animate-[mxIn_.3s_ease_both] overflow-hidden motion-reduce:animate-none rounded-[24px] border shadow-[0_1px_2px_rgba(12,18,32,0.04),0_24px_60px_-40px_rgba(12,18,32,0.25)]">
      <div className="flex flex-col gap-[6px] px-[20px] pt-[30px] pb-[6px] sm:px-[32px]">
        <h1
          tabIndex={-1}
          className="m-0 text-[28px] leading-[1.15] font-semibold tracking-[-0.03em] outline-none max-sm:text-[24px]"
        >
          {title}
        </h1>
        {lead ? <p className="text-muted m-0 text-[15px] italic">{lead}</p> : null}
      </div>
      {shown ? <StepError className="mx-[20px] mt-[18px] sm:mx-[32px]">{shown}</StepError> : null}
      <div className={cn("flex flex-col px-[20px] pt-[24px] pb-[30px] sm:px-[32px]", gap)}>
        {children}
      </div>
      <footer className="border-line bg-surface-2 flex items-center justify-between gap-[12px] border-t px-[20px] py-[18px] sm:px-[32px]">
        {footer}
      </footer>
    </section>
  );
}

/** Back (disabled at 45% on the first step) and Continue / Finish with the arrow. */
export function StepFooter({
  onBack,
  busy = false,
  disabled = false,
  label = "Continue",
  onNext,
}: {
  /** Omit on the first step: Back renders disabled. */
  onBack?: () => void;
  busy?: boolean;
  disabled?: boolean;
  label?: string;
  /** Omit to make the button submit the step's form. */
  onNext?: () => void;
}) {
  const navigating = useContext(NavBusyContext);
  return (
    <>
      <Button
        variant="secondary"
        size={44}
        disabled={!onBack}
        onClick={onBack}
        className="disabled:opacity-[0.45]"
      >
        Back
      </Button>
      <Button
        type={onNext ? "button" : "submit"}
        size={44}
        iconRight={ArrowRight}
        iconSize={15}
        disabled={busy || disabled || navigating}
        onClick={onNext}
        className="px-[20px]"
      >
        {busy ? "One moment…" : label}
      </Button>
    </>
  );
}

/** h2 inside a step body ("Booking rules", "Common questions (optional)"). */
export function StepSubheading({ children }: { children: React.ReactNode }) {
  return <h2 className="m-0 text-[17px] font-semibold tracking-[-0.01em]">{children}</h2>;
}

/** Maps zod issues to { firstPathSegment: message }. */
export function issueMap(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>) {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const k = String(i.path[0] ?? "_");
    out[k] ??= i.message;
  }
  return out;
}
