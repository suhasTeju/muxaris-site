import type { LucideIcon } from "lucide-react";
import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "./cn";

/** Field heights the design uses, in px, each with its radius, padding and type size. */
export type FieldSize = 34 | 36 | 38 | 40 | 42 | 44 | 48;

const BOX: Record<FieldSize, string> = {
  34: "h-[34px] rounded-8 px-[9px] text-[13.5px]",
  36: "h-[36px] rounded-9 px-[8px] text-[13.5px]",
  38: "h-[38px] rounded-9 px-[10px] text-[14px]",
  40: "h-[40px] rounded-9 px-[10px] text-[14px]",
  42: "h-[42px] rounded-10 px-[12px] text-[14.5px]",
  44: "h-[44px] rounded-10 px-[12px] text-[15px]",
  48: "h-[48px] rounded-12 px-[14px] text-[15px]",
};

/** Geist Mono runs a step smaller than the sans at the same height (dates, phones, numbers). */
const MONO: Record<FieldSize, string> = {
  34: "font-mono text-[13px]",
  36: "font-mono text-[12.5px]",
  38: "font-mono text-[13.5px]",
  40: "font-mono text-[13.5px]",
  42: "font-mono text-[13.5px]",
  44: "font-mono text-[14px]",
  48: "font-mono text-[15px]",
};

/** Border, focus ring and invalid state shared by Input, Select and Textarea. */
export const controlBase =
  "w-full min-w-0 border border-field bg-surface text-ink outline-none transition-[border-color,box-shadow] duration-150 focus:border-teal focus:shadow-focus focus-visible:outline-none aria-[invalid=true]:border-rose-invalid disabled:cursor-not-allowed disabled:opacity-70";

/** Auth and site forms: tinted field that turns white on focus. */
const SOFT = "bg-subtle focus:bg-surface";

export function fieldBox(size: FieldSize, opts: { mono?: boolean; soft?: boolean } = {}): string {
  return cn(controlBase, BOX[size], opts.soft && SOFT, opts.mono && MONO[size]);
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: FieldSize;
  /** Geist Mono, for dates, times, phones and numbers. */
  mono?: boolean;
  /** Tinted #f8fafc field (auth and site forms). */
  soft?: boolean;
  /** Rose border; also sets aria-invalid. */
  invalid?: boolean;
  /** Leading icon, as in the patient search (16px, #8a95a5, 12px from the left). */
  icon?: LucideIcon;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = 40, mono, soft, invalid, icon: Icon, className, ...rest },
  ref,
) {
  const input = (
    <input
      ref={ref}
      aria-invalid={invalid || rest["aria-invalid"] ? true : undefined}
      className={cn(fieldBox(size, { mono, soft }), Icon && "pl-[38px]", className)}
      {...rest}
    />
  );
  if (!Icon) return input;
  return (
    <span className="relative flex w-full items-center">
      <Icon size={16} className="text-muted-2 pointer-events-none absolute left-[12px]" />
      {input}
    </span>
  );
});
