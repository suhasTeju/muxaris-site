"use client";

import { cn } from "./cn";

/** Track heights the design uses: 22 (inline in tables), 26 (forms), 28 (settings rows). */
export type SwitchSize = 22 | 26 | 28;

const DIM: Record<SwitchSize, { track: string; knob: string; on: string }> = {
  22: { track: "w-[38px] h-[22px]", knob: "size-[16px]", on: "left-[19px]" },
  26: { track: "w-[44px] h-[26px]", knob: "size-[20px]", on: "left-[21px]" },
  28: { track: "w-[48px] h-[28px]", knob: "size-[22px]", on: "left-[23px]" },
};

export interface SwitchProps {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  size?: SwitchSize;
  disabled?: boolean;
  /** Accessible name when there is no visible label pointing at it. */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  id?: string;
  className?: string;
}

/** Pill switch: teal when on, #c3ccd7 when off, white knob 3px from the edge. role="switch". */
export function Switch({
  checked,
  onCheckedChange,
  size = 26,
  disabled,
  className,
  ...aria
}: SwitchProps) {
  const d = DIM[size];
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        "relative shrink-0 cursor-pointer rounded-pill border-0 p-0 transition-[background-color] duration-150 disabled:cursor-not-allowed disabled:opacity-70",
        d.track,
        checked ? "bg-teal" : "bg-line-strong",
        className,
      )}
      {...aria}
    >
      <span
        aria-hidden="true"
        className={cn(
          "bg-surface shadow-knob absolute top-[3px] rounded-full transition-[left] duration-150",
          d.knob,
          checked ? d.on : "left-[3px]",
        )}
      />
    </button>
  );
}
