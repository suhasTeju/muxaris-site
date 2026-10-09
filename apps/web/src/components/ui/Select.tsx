import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "./cn";
import { controlBase, type FieldSize } from "./Input";

/** Selects keep the native arrow, as the design does; padding is a touch tighter than inputs. */
const BOX: Record<FieldSize, string> = {
  34: "h-[34px] rounded-8 px-[8px] text-[13.5px]",
  36: "h-[36px] rounded-9 px-[8px] text-[13.5px]",
  38: "h-[38px] rounded-9 px-[8px] text-[14px]",
  40: "h-[40px] rounded-9 px-[8px] text-[14px]",
  42: "h-[42px] rounded-10 px-[10px] text-[14.5px]",
  44: "h-[44px] rounded-10 px-[10px] text-[15px]",
  48: "h-[48px] rounded-12 px-[12px] text-[15px]",
};

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  size?: FieldSize;
  soft?: boolean;
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { size = 40, soft, invalid, className, children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || rest["aria-invalid"] ? true : undefined}
      className={cn(controlBase, BOX[size], soft && "bg-subtle focus:bg-surface", className)}
      {...rest}
    >
      {children}
    </select>
  );
});
