import { cn } from "./cn";
import type { Tone } from "./tones";

/** Heights the design uses: 18 (calendar blocks), 20 (compact), 22 (tables, default), 24 (headers). */
export type BadgeSize = 18 | 20 | 22 | 24;

const SIZE: Record<BadgeSize, { box: string; dot: string }> = {
  18: { box: "h-[18px] rounded-5 px-[6px] gap-[5px] text-[11px]", dot: "size-[5px]" },
  20: { box: "h-[20px] rounded-6 px-[7px] gap-[5px] text-[11.5px]", dot: "size-[6px]" },
  22: { box: "h-[22px] rounded-6 px-[8px] gap-[6px] text-[12px]", dot: "size-[6px]" },
  24: { box: "h-[24px] rounded-7 px-[9px] gap-[6px] text-[12.5px]", dot: "size-[6px]" },
};

const SOFT: Record<Tone, string> = {
  good: "bg-good-bg text-good-fg",
  warn: "bg-warn-bg text-warn-fg",
  bad: "bg-bad-bg text-bad-fg",
  muted: "bg-muted-bg text-muted-fg",
  info: "bg-info-bg text-info-fg",
};

/** Outline badges (call status) take the tone's background as their border, as in the design. */
const OUTLINE: Record<Tone, string> = {
  good: "border border-good-bg text-good-fg",
  warn: "border border-warn-bg text-warn-fg",
  bad: "border border-bad-bg text-bad-fg",
  muted: "border border-muted-bg text-muted-fg",
  info: "border border-info-bg text-info-fg",
};

const DOT: Record<Tone, string> = {
  good: "bg-good-dot",
  warn: "bg-warn-dot",
  bad: "bg-bad-dot",
  muted: "bg-muted-dot",
  info: "bg-info-dot",
};

export interface BadgeProps {
  tone?: Tone;
  size?: BadgeSize;
  /** Coloured dot before the label (on by default; outline badges have none). */
  dot?: boolean;
  variant?: "soft" | "outline";
  children: React.ReactNode;
  className?: string;
}

/** Status badge from the TONES map. Pair with badgeFor() from ./tones for the design's labels. */
export function Badge({
  tone = "muted",
  size = 22,
  dot,
  variant = "soft",
  children,
  className,
}: BadgeProps) {
  const showDot = dot ?? variant === "soft";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center font-medium whitespace-nowrap",
        SIZE[size].box,
        variant === "soft" ? SOFT[tone] : OUTLINE[tone],
        className,
      )}
    >
      {showDot ? (
        <span aria-hidden="true" className={cn("rounded-full", SIZE[size].dot, DOT[tone])} />
      ) : null}
      {children}
    </span>
  );
}
