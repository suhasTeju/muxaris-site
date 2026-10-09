import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { cn } from "./cn";
import { UsageMeter, usageColors, usagePct } from "./UsageMeter";

export interface KpiCardProps {
  label: React.ReactNode;
  /** 14px icon before the label (Overview cards have one; Analytics cards do not). */
  icon?: LucideIcon;
  /** Big figure: 32px/600, -0.03em. */
  value: React.ReactNode;
  /** Smaller text after the value, e.g. "/ 3,000" (14px #5f6b7c). */
  unit?: React.ReactNode;
  /** Line under the value (12.5px). */
  hint?: React.ReactNode;
  /** Colour of the hint. "link" is teal 500 with an arrow (card links to a page). */
  hintTone?: "muted" | "bad" | "link";
  /** Draws a 6px usage meter between value and hint; colours flip at 90%. */
  meter?: { used: number; included: number };
  /** Right side of the label row, e.g. an "urgent" badge. */
  badge?: React.ReactNode;
  /** Makes the whole card a link with the hover lift (#b9e3e0 border, soft shadow). */
  href?: string;
  className?: string;
}

/** KPI tile from Overview and Analytics: radius 16, padding 18 (16 at the bottom when it has a hint). */
export function KpiCard({
  label,
  icon: Icon,
  value,
  unit,
  hint,
  hintTone,
  meter,
  badge,
  href,
  className,
}: KpiCardProps) {
  const pct = meter ? usagePct(meter.used, meter.included) : 0;
  const tone = hintTone ?? (meter && usageColors(pct).hot ? "bad" : "muted");
  const body = (
    <>
      <span className="text-muted flex items-center gap-[8px] text-[13px]">
        {Icon ? <Icon size={14} className="shrink-0" /> : null}
        {label}
        {badge ? <span className="ml-auto">{badge}</span> : null}
      </span>
      {unit ? (
        <span className="flex items-baseline gap-[6px]">
          <span className="text-[32px] leading-none font-semibold tracking-[-0.03em]">{value}</span>
          <span className="text-muted text-[14px]">{unit}</span>
        </span>
      ) : (
        <span className="text-[32px] leading-none font-semibold tracking-[-0.03em]">{value}</span>
      )}
      {meter ? <UsageMeter used={meter.used} included={meter.included} /> : null}
      {hint ? (
        <span
          className={cn(
            "text-[12.5px]",
            tone === "muted" && "text-muted",
            tone === "bad" && "text-rose",
            tone === "link" && "text-teal-ink flex items-center gap-[6px] font-medium",
          )}
        >
          {hint}
          {tone === "link" ? <ArrowRight size={12} /> : null}
        </span>
      ) : null}
    </>
  );
  const box = cn(
    "border-line bg-surface shadow-rest flex flex-col gap-[10px] rounded-16 border p-[18px]",
    hint && "pb-[16px]",
    className,
  );
  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          box,
          "text-ink hover:border-teal-hover hover:shadow-hover hover:text-ink transition-all duration-150",
        )}
      >
        {body}
      </Link>
    );
  }
  return <div className={box}>{body}</div>;
}
