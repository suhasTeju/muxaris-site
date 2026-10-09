"use client";

import { cloneElement, isValidElement, useId } from "react";
import { cn } from "./cn";

/**
 * Label styles from the design:
 * default 13px/500 #2c3646 gap 6 (most forms) · lg 13.5px gap 7 (dialogs with 42px fields)
 * muted 12.5px #5f6b7c gap 6 (callback cards) · filter 12px #5f6b7c gap 5 (filter bars)
 */
export type FieldVariant = "default" | "lg" | "muted" | "filter";

const LABEL: Record<FieldVariant, { wrap: string; label: string }> = {
  default: { wrap: "gap-[6px]", label: "text-[13px] font-medium text-ink-2" },
  lg: { wrap: "gap-[7px]", label: "text-[13.5px] font-medium text-ink-2" },
  muted: { wrap: "gap-[6px]", label: "text-[12.5px] font-medium text-muted" },
  filter: { wrap: "gap-[5px]", label: "text-[12px] font-medium text-muted" },
};

export interface FieldProps {
  label: React.ReactNode;
  /** One control (Input, Select, Textarea or a native element). It receives id and aria-describedby. */
  children: React.ReactElement<{
    id?: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
  }>;
  hint?: React.ReactNode;
  /** Error text in rose; also marks the control aria-invalid. */
  error?: React.ReactNode;
  /** Right-aligned counter under the control, e.g. "42/300" (Geist Mono 11px #8a95a5). */
  counter?: React.ReactNode;
  variant?: FieldVariant;
  id?: string;
  className?: string;
}

export function Field({
  label,
  children,
  hint,
  error,
  counter,
  variant = "default",
  id: idProp,
  className,
}: FieldProps) {
  const auto = useId();
  const id = idProp ?? children.props.id ?? `f${auto}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy =
    [children.props["aria-describedby"], hintId, errorId].filter(Boolean).join(" ") || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        "aria-describedby": describedBy,
        ...(error ? { "aria-invalid": true } : {}),
      })
    : children;
  const v = LABEL[variant];
  return (
    <div className={cn("flex min-w-0 flex-col", v.wrap, className)}>
      <label htmlFor={id} className={v.label}>
        {label}
      </label>
      {control}
      {counter ? (
        <span className="text-muted-2 self-end font-mono text-[11px]">{counter}</span>
      ) : null}
      {hint ? (
        <span id={hintId} className="text-muted text-[12.5px]">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} className="text-rose text-[12px]">
          {error}
        </span>
      ) : null}
    </div>
  );
}
