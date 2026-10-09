import { DataTable, pct } from "./DataTable";

export interface MonthBar {
  /** "May" */
  label: string;
  value: number;
}

/**
 * Minutes per month, as the Analytics prototype draws it: a value over each bar (max 48px wide),
 * the current (last) month in teal, and a dashed line at the plan's included minutes. The scale
 * leaves 8% headroom above the larger of the tallest bar and the included line.
 */
export function MonthBars({
  title,
  months,
  included,
}: {
  title: string;
  months: MonthBar[];
  /** Included minutes; the dashed line is drawn only when known. */
  included?: number;
}) {
  const max = Math.max(0, ...months.map((m) => m.value), included ?? 0) * 1.08;
  return (
    <>
      <div
        role="img"
        aria-label={title}
        className="border-line relative flex h-[180px] items-end gap-[18px] border-b px-[6px] max-sm:gap-[10px]"
      >
        {included !== undefined ? (
          <div
            data-included
            className="border-line-strong absolute inset-x-0 border-t-[1.5px] border-dashed"
            style={{ bottom: `${pct(included, max)}%` }}
          />
        ) : null}
        {months.map((m, i) => (
          <div
            key={`${m.label}-${i}`}
            className="flex h-full flex-1 flex-col items-center justify-end gap-[6px]"
          >
            <span className="text-ink-2 font-mono text-[11.5px]">
              {m.value.toLocaleString("en-IN")}
            </span>
            <div
              data-bar
              className={`w-full max-w-[48px] rounded-[6px_6px_0_0] ${i === months.length - 1 ? "bg-teal" : "bg-[#c9e9e6]"}`}
              style={{ height: `${pct(m.value, max)}%` }}
            />
          </div>
        ))}
      </div>
      <div
        className="text-muted-2 flex gap-[18px] px-[6px] font-mono text-[11px] max-sm:gap-[10px]"
        aria-hidden="true"
      >
        {months.map((m, i) => (
          <span key={`${m.label}-${i}`} className="flex-1 text-center">
            {m.label}
          </span>
        ))}
      </div>
      <DataTable
        title={title}
        categories={months.map((m) => m.label)}
        series={[{ name: "Minutes", values: months.map((m) => m.value) }]}
      />
    </>
  );
}
