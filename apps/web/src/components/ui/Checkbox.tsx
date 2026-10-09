import { Check } from "lucide-react";
import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "./cn";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Text beside the box (13.5px). Omit and pass aria-label for a bare box. */
  label?: React.ReactNode;
}

/**
 * 16px box, 5px radius: #c3ccd7 border when off, teal fill with a white 11px check when on
 * (working-hours rows in the design). A real checkbox input, so it works in forms.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, className, disabled, ...rest },
  ref,
) {
  return (
    <label
      className={cn(
        "text-ink inline-flex cursor-pointer items-center gap-[8px] text-[13.5px]",
        disabled && "cursor-not-allowed opacity-70",
        className,
      )}
    >
      <span className="relative inline-grid size-[16px] shrink-0 place-items-center">
        <input
          ref={ref}
          type="checkbox"
          disabled={disabled}
          className="peer border-line-strong bg-surface checked:border-teal checked:bg-teal col-start-1 row-start-1 size-[16px] cursor-[inherit] appearance-none rounded-5 border"
          {...rest}
        />
        <Check
          size={11}
          className="pointer-events-none col-start-1 row-start-1 text-white opacity-0 peer-checked:opacity-100"
        />
      </span>
      {label}
    </label>
  );
});
