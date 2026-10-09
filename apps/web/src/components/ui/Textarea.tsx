import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "./cn";
import { controlBase } from "./Input";

/** sm: FAQ answers. md: forms next to 40px inputs. lg: greetings and knowledge, next to 42px inputs. */
export type TextareaSize = "sm" | "md" | "lg";

const BOX: Record<TextareaSize, string> = {
  sm: "rounded-8 px-[10px] py-[8px] text-[13.5px] leading-[1.5]",
  md: "rounded-9 px-[10px] py-[8px] text-[14px]",
  lg: "rounded-10 px-[12px] py-[10px] text-[14.5px] leading-[1.55]",
};

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  size?: TextareaSize;
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { size = "md", invalid, className, rows = 3, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || rest["aria-invalid"] ? true : undefined}
      className={cn(controlBase, "resize-y", BOX[size], className)}
      {...rest}
    />
  );
});
