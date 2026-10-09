import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/components/ui";

/**
 * ARIA table rows with the UI kit's TableHead / TableRow / TableGroup look (same classes, same
 * 14px column gap and 18px inset). The kit's rows take no role props, and a row that is itself a
 * link cannot be a `row`, so here every row is a `row` of `cell`s and one cell holds a link
 * stretched over the row with `ROW_LINK`: the whole row still clicks through.
 */

const grid = (columns: string, gap: number): CSSProperties => ({
  gridTemplateColumns: columns,
  columnGap: gap,
});

/** Header row: #fbfcfd, bottom rule, Geist Mono 10.5px uppercase. */
export function HeadRow({
  columns,
  gap = 14,
  labels,
}: {
  columns: string;
  gap?: number;
  /** One per column; "" for a column without a visible heading. */
  labels: string[];
}) {
  return (
    <div
      role="row"
      className="bg-surface-2 border-line text-muted grid border-b px-[18px] py-[11px] font-mono text-[10.5px] tracking-[0.08em] uppercase"
      style={grid(columns, gap)}
    >
      {labels.map((label, i) => (
        <span key={i} role="columnheader">
          {label}
        </span>
      ))}
    </div>
  );
}

/** Body row: 11px 18px, top rule, 14px ink, #f8fafc on hover or while its link has focus. */
export function BodyRow({
  columns,
  gap = 14,
  children,
}: {
  columns: string;
  gap?: number;
  children: ReactNode;
}) {
  return (
    <div
      role="row"
      className="border-line-soft text-ink hover:bg-subtle has-[a:focus-visible]:bg-subtle relative grid items-center border-t px-[18px] py-[11px] text-[14px]"
      style={grid(columns, gap)}
    >
      {children}
    </div>
  );
}

/** Classes for the one link in a BodyRow: ink text (not the global teal) and a full-row hit area. */
export const ROW_LINK = "text-ink hover:text-ink after:absolute after:inset-0";

/** Day group label spanning the table ("Today · Fri, 9 Oct 2026"). */
export function GroupRow({
  span,
  className,
  children,
}: {
  span: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="row">
      <div
        role="cell"
        aria-colspan={span}
        className={cn(
          "bg-subtle border-chip text-ink-3 border-t px-[18px] py-[8px] text-[12px] font-semibold",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
