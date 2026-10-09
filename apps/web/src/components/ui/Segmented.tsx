"use client";

import Link from "next/link";
import { cn } from "./cn";

export interface SegmentedItem {
  id: string;
  label: React.ReactNode;
  /** Render as a link with aria-current (Analytics range: 7 / 30 / 90 days). */
  href?: string;
}

export interface SegmentedProps {
  items: SegmentedItem[];
  value: string;
  onChange?: (id: string) => void;
  "aria-label": string;
  /**
   * tablist (default): Appointments Day / Week. radiogroup: Assistant tone.
   * Ignored when items have hrefs (rendered as a nav of links).
   */
  role?: "tablist" | "radiogroup";
  /** 30: page controls (default). 34: inside forms (Assistant tone). */
  size?: 30 | 34;
  /** bordered: #e9eef3 track with a #e2e7ee border (default). plain: #eef2f6 track, no border. */
  track?: "bordered" | "plain";
  className?: string;
}

/** Pill segmented control: 3px track padding, radius 11; selected segment white with a soft shadow. */
export function Segmented({
  items,
  value,
  onChange,
  role = "tablist",
  size = 30,
  track = "bordered",
  className,
  ...aria
}: SegmentedProps) {
  const asLinks = items.some((i) => i.href);
  const wrap = cn(
    "inline-flex rounded-11 p-[3px]",
    // Narrow screens: never wider than the column; extra segments scroll sideways.
    "max-lg:max-w-full max-lg:overflow-x-auto max-lg:[scrollbar-width:none] max-lg:[&::-webkit-scrollbar]:hidden",
    track === "bordered" ? "bg-track border-line border" : "bg-chip",
    className,
  );
  const seg = (on: boolean) =>
    cn(
      "text-ink hover:text-ink inline-flex shrink-0 cursor-pointer items-center rounded-8 border-0 px-[14px] text-[13.5px] font-medium whitespace-nowrap",
      size === 30 ? "h-[30px]" : "h-[34px]",
      on
        ? cn(
            "bg-surface",
            track === "bordered" ? "shadow-seg" : "shadow-[0_1px_2px_rgba(12,18,32,0.12)]",
          )
        : "bg-transparent",
    );
  if (asLinks) {
    return (
      <nav {...aria} className={wrap}>
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.href ?? "#"}
            aria-current={item.id === value ? "page" : undefined}
            onClick={() => onChange?.(item.id)}
            className={seg(item.id === value)}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    );
  }
  const itemRole = role === "tablist" ? "tab" : "radio";
  return (
    <div role={role} {...aria} className={wrap}>
      {items.map((item) => {
        const on = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role={itemRole}
            {...(itemRole === "tab" ? { "aria-selected": on } : { "aria-checked": on })}
            onClick={() => onChange?.(item.id)}
            className={seg(on)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
