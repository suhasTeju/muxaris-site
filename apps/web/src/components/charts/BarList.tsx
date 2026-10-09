import { DataTable, pct } from "./DataTable";

export interface BarListItem {
  key: string;
  /** Visible label cell (language name and native script, or an outcome with its dot). */
  label: React.ReactNode;
  /** Plain-text label for the screen-reader table. */
  text: string;
  value: number;
  /** Fill colour of the bar. */
  color: string;
}

/**
 * Horizontal bars in a three-column grid (label, 10px track, mono count), as in the Analytics
 * prototype's "Calls by language" and "Calls by outcome". Bars scale to the largest value.
 */
export function BarList({
  title,
  items,
  labelWidth,
  rowGap,
}: {
  title: string;
  items: BarListItem[];
  /** Width of the label column in px (92 for languages, 96 for outcomes). */
  labelWidth: number;
  /** Gap between rows in px (12 for languages, 10 for outcomes). */
  rowGap: number;
}) {
  const max = Math.max(0, ...items.map((i) => i.value));
  return (
    <>
      <div role="img" aria-label={title} className="flex flex-col" style={{ gap: rowGap }}>
        {items.map((it) => (
          <div
            key={it.key}
            className="grid items-center gap-[12px]"
            style={{ gridTemplateColumns: `${labelWidth}px minmax(0,1fr) 46px` }}
          >
            {it.label}
            <div className="bg-line-soft h-[10px] overflow-hidden rounded-6">
              <div
                data-bar
                className="h-[10px] rounded-6"
                style={{ width: `${pct(it.value, max)}%`, background: it.color }}
              />
            </div>
            <span className="text-right font-mono text-[12.5px]">
              {it.value.toLocaleString("en-IN")}
            </span>
          </div>
        ))}
      </div>
      <DataTable
        title={title}
        categories={items.map((i) => i.text)}
        series={[{ name: "Calls", values: items.map((i) => i.value) }]}
      />
    </>
  );
}
