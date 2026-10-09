import { cn } from "@/components/ui";
import { DataTable, pct } from "./DataTable";

export interface BarSeries {
  name: string;
  values: number[];
}

/**
 * Vertical bars drawn as CSS boxes, as the Analytics prototype draws them: each bar takes an equal
 * share of the width (`flex: 1`), its height is a percentage of the largest value, and faint grid
 * lines repeat every `gridStep` px. An optional `overlay` series draws inside each bar from the
 * bottom as a share of that bar (Calls per day: booked out of calls). Ticks sit under the plot,
 * spread edge to edge. A hidden table carries the numbers for screen readers.
 */
export function BarChart({
  title,
  summary,
  categories,
  series,
  overlay,
  height,
  gap,
  gridStep,
  ticks,
  barClassName,
  overlayClassName = "bg-teal",
  barTitle,
  className,
}: {
  /** Names the hidden data table. */
  title: string;
  /** Accessible name of the plot (defaults to the title). */
  summary?: string;
  categories: string[];
  series: BarSeries;
  overlay?: BarSeries;
  /** Plot height in px, including any top padding in `className`. */
  height: number;
  /** Gap between bars in px. */
  gap: number;
  /** Distance between grid lines in px. */
  gridStep: number;
  ticks: string[];
  /** Fill (and hover) classes per bar. */
  barClassName: (value: number, max: number, index: number) => string;
  overlayClassName?: string;
  /** Native tooltip per bar. */
  barTitle?: (index: number) => string;
  className?: string;
}) {
  const max = Math.max(0, ...series.values);
  return (
    <>
      <div
        role="img"
        aria-label={summary ?? title}
        className={cn("border-line relative flex items-end border-b", className)}
        style={{
          height,
          gap,
          backgroundImage: "linear-gradient(#f1f4f7 1px, transparent 1px)",
          backgroundSize: `100% ${gridStep}px`,
        }}
      >
        {series.values.map((v, i) => {
          const o = overlay?.values[i] ?? 0;
          return (
            <div
              key={`${categories[i]}-${i}`}
              data-bar
              title={barTitle?.(i)}
              className={cn(
                "relative min-w-[2px] flex-1 rounded-[4px_4px_0_0] max-sm:min-w-px",
                barClassName(v, max, i),
              )}
              style={{ height: `${pct(v, max)}%` }}
            >
              {overlay ? (
                <div
                  data-overlay
                  className={cn(
                    "absolute inset-x-0 bottom-0 rounded-[4px_4px_0_0]",
                    overlayClassName,
                  )}
                  style={{ height: `${v ? pct(o, v) : 0}%` }}
                />
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="text-muted-2 flex justify-between font-mono text-[11px]" aria-hidden="true">
        {ticks.map((t, i) => (
          // Below 640px every other label is hidden; `invisible` keeps the others in place.
          <span key={`${t}-${i}`} className={i % 2 ? "max-sm:invisible" : undefined}>
            {t}
          </span>
        ))}
      </div>
      <DataTable
        title={title}
        categories={categories}
        series={overlay ? [series, overlay] : [series]}
      />
    </>
  );
}
