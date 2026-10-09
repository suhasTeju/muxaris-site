// The modal now lives in the design-system primitives; this module keeps the old import path and
// the class strings that unmigrated forms still use, retargeted to the redesign's values.
export { Modal } from "@/components/ui/Modal";

/** 40px field: #d3dae3 border, radius 9, teal border and ring on focus. */
export const fieldClass =
  "border-field bg-surface text-ink min-h-10 w-full rounded-9 border px-[10px] text-[14px] outline-none transition-[border-color,box-shadow] duration-150 focus:border-teal focus:shadow-focus focus-visible:outline-none aria-[invalid=true]:border-rose-invalid";
/** Ink button, 38px, radius 10, inset highlight, hover #1d2638. */
export const primaryBtn =
  "bg-ink text-white shadow-highlight hover:bg-ink-hover hover:text-white inline-flex min-h-[38px] cursor-pointer items-center justify-center gap-[8px] rounded-10 px-[14px] text-[14px] font-semibold transition-colors disabled:opacity-70";
/** White button, 38px, #d3dae3 border, hover #f4f6f9. */
export const ghostBtn =
  "border-field bg-surface text-ink hover:bg-paper hover:text-ink inline-flex min-h-[38px] cursor-pointer items-center justify-center gap-[8px] rounded-10 border px-[14px] text-[14px] font-medium transition-colors disabled:opacity-70";
