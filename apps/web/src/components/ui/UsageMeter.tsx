import { cn } from "./cn";

/** At or above this share of the plan the meter turns rose (design: pct >= 90). */
export const USAGE_HOT_PCT = 90;

/** Percentage used, clamped to 0..100. */
export function usagePct(used: number, included: number): number {
  if (!(included > 0)) return 0;
  return Math.max(0, Math.min(100, (used / included) * 100));
}

/** Meter fill and hint colours for a percentage: rose #e04870 / #b4234a when hot, else teal / muted. */
export function usageColors(pct: number): { fill: string; hint: string; hot: boolean } {
  const hot = pct >= USAGE_HOT_PCT;
  return { fill: hot ? "#e04870" : "#0e9a96", hint: hot ? "#b4234a" : "#5f6b7c", hot };
}

export interface UsageMeterProps {
  used: number;
  included: number;
  /** Track height: 6 (sidebar, KPI card), 8 (plan card), 10 (analytics bars). Radius equals height. */
  height?: 6 | 8 | 10;
  /** Override the fill colour (default follows the hot threshold). */
  color?: string;
  /** Track colour; #eef2f6 by default, #f1f4f7 in analytics. */
  track?: string;
  label?: string;
  className?: string;
}

/** Usage bar: #eef2f6 track, teal fill, rose at 90% or more. role="meter" with the percentage. */
export function UsageMeter({
  used,
  included,
  height = 6,
  color,
  track = "#eef2f6",
  label = "Minutes used",
  className,
}: UsageMeterProps) {
  const pct = usagePct(used, included);
  const fill = color ?? usageColors(pct).fill;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={cn("overflow-hidden", className)}
      style={{ height, borderRadius: height, background: track }}
    >
      <div
        style={{ height, width: `${pct.toFixed(1)}%`, borderRadius: height, background: fill }}
      />
    </div>
  );
}
