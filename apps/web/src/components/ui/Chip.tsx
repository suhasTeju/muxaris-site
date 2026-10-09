import { cn } from "./cn";
import type { Tone } from "./tones";

const TONE: Record<Tone, string> = {
  good: "bg-good-bg text-good-fg",
  warn: "bg-warn-bg text-warn-fg",
  bad: "bg-bad-bg text-bad-fg",
  muted: "bg-chip text-ink-3",
  info: "bg-info-bg text-info-fg",
};

/** Mono uppercase chip, like the role label in the header: 2px 8px, radius 6, 10.5px, 0.06em. */
export function Chip({
  tone = "muted",
  children,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-6 px-[8px] py-[2px] font-mono text-[10.5px] tracking-[0.06em] whitespace-nowrap uppercase",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
