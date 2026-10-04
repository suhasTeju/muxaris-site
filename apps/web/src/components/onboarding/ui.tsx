"use client";

import { useId } from "react";
import type { ApiInit } from "@/lib/api";
import { ApiError } from "@/lib/api";

export type Call = <T>(path: string, init?: ApiInit) => Promise<T>;

export function errMsg(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 403) return "You do not have permission to do that for this clinic.";
    return e.message || "Something went wrong. Please try again.";
  }
  return "Something went wrong. Please try again.";
}

const ring = "outline-none focus-visible:ring-4 focus-visible:ring-accent-soft";
export const inputCls = `border-line bg-paper text-ink placeholder:text-muted focus:border-accent focus:ring-accent-soft min-h-11 w-full rounded-lg border px-3.5 py-2 text-base outline-none focus:ring-4 disabled:opacity-60`;

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  children: (p: {
    id: string;
    "aria-invalid": boolean;
    "aria-describedby": string | undefined;
  }) => React.ReactNode;
}) {
  const id = useId();
  const note = error ?? hint;
  return (
    <div className="block">
      <label htmlFor={id} className="text-ink text-sm font-medium">
        {label}
      </label>
      <div className="mt-1.5">
        {children({
          id,
          "aria-invalid": Boolean(error),
          "aria-describedby": note ? `${id}-note` : undefined,
        })}
      </div>
      {note ? (
        <p id={`${id}-note`} className={`mt-1 text-sm ${error ? "text-danger" : "text-muted"}`}>
          {note}
        </p>
      ) : null}
    </div>
  );
}

export function TextField({
  label,
  error,
  hint,
  ...props
}: { label: string; error?: string | undefined; hint?: string | undefined } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "id"
>) {
  return (
    <Field label={label} error={error} hint={hint}>
      {(a) => <input {...a} {...props} className={inputCls} />}
    </Field>
  );
}

export function SelectField({
  label,
  error,
  options,
  ...props
}: {
  label: string;
  error?: string | undefined;
  options: ReadonlyArray<{ value: string; label: string }>;
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "id">) {
  return (
    <Field label={label} error={error}>
      {(a) => (
        <select {...a} {...props} className={inputCls}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function Check({
  label,
  ...props
}: { label: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  return (
    <label className="text-ink flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
      <input
        type="checkbox"
        {...props}
        className="accent-accent focus-visible:ring-accent-soft size-5 rounded outline-none focus-visible:ring-4"
      />
      {label}
    </label>
  );
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  busy?: boolean;
};

export function Btn({ variant = "primary", busy, children, className = "", ...props }: BtnProps) {
  const base = `min-h-11 rounded-lg px-5 py-2.5 text-base font-medium transition-colors disabled:opacity-60 ${ring}`;
  const tone =
    variant === "primary"
      ? "bg-accent hover:bg-accent-deep text-on-accent"
      : variant === "secondary"
        ? "border-line bg-surface text-ink hover:bg-paper border"
        : "text-muted hover:text-ink underline-offset-4 hover:underline";
  return (
    <button
      type="button"
      {...props}
      disabled={busy || props.disabled}
      className={`${base} ${tone} ${className}`}
    >
      {busy ? "One moment…" : children}
    </button>
  );
}

export function ErrorNote({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="bg-danger-soft text-danger rounded-lg px-3.5 py-2.5 text-sm">
      {message}
    </p>
  );
}

export function StepShell({
  title,
  lead,
  children,
  footer,
}: {
  title: string;
  lead?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <section className="border-line bg-surface shadow-card rounded-2xl border p-6 sm:p-10">
      <h1 tabIndex={-1} className="font-display text-3xl leading-tight outline-none">
        {title}
      </h1>
      {lead ? <p className="font-display text-muted mt-2 italic">{lead}</p> : null}
      <div className="mt-8 space-y-6">{children}</div>
      <div className="mt-10 flex flex-wrap items-center justify-between gap-3">{footer}</div>
    </section>
  );
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
