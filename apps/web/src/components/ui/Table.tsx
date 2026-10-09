import Link from "next/link";
import { cn } from "./cn";

interface GridProps {
  /** grid-template-columns, copied from the design (e.g. "170px minmax(0,1fr) 90px 20px"). */
  columns: string;
  /** Column gap in px: 14 in most tables, 12 in Notifications and Services. */
  gap?: number;
  /** Horizontal padding: 18 (dashboard tables) or 20 (settings cards). */
  inset?: 18 | 20;
  className?: string;
  children: React.ReactNode;
}

/** Table head row: #fbfcfd, bottom rule #e2e7ee, Geist Mono 10.5px, 0.08em, uppercase, #5f6b7c. */
export function TableHead({ columns, gap = 14, inset = 18, className, children }: GridProps) {
  return (
    <div
      className={cn(
        "bg-surface-2 border-line text-muted grid border-b font-mono text-[10.5px] tracking-[0.08em] uppercase",
        inset === 18 ? "px-[18px] py-[11px]" : "px-[20px] py-[10px]",
        className,
      )}
      style={{ gridTemplateColumns: columns, columnGap: gap }}
    >
      {children}
    </div>
  );
}

export interface TableRowProps extends GridProps {
  /** Makes the row a link with the #f8fafc hover. */
  href?: string;
  onClick?: () => void;
}

/** Body row: 11px 18px, top rule #f1f4f7, 14px ink; hover #f8fafc when it links somewhere. */
export function TableRow({
  columns,
  gap = 14,
  inset = 18,
  href,
  onClick,
  className,
  children,
}: TableRowProps) {
  const cls = cn(
    "border-line-soft text-ink grid items-center border-t text-[14px]",
    inset === 18 ? "px-[18px] py-[11px]" : "px-[20px] py-[10px]",
    (href || onClick) && "hover:bg-subtle hover:text-ink cursor-pointer",
    className,
  );
  const style = { gridTemplateColumns: columns, columnGap: gap };
  if (href) {
    return (
      <Link href={href} className={cls} style={style}>
        {children}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(cls, "w-full text-left")} style={style}>
        {children}
      </button>
    );
  }
  return (
    <div className={cls} style={style}>
      {children}
    </div>
  );
}

/** Day group label inside a table (Calls: "Today"): 8px 18px, #f8fafc, 12px/600 #4a5566. */
export function TableGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-subtle border-chip text-ink-3 border-t px-[18px] py-[8px] text-[12px] font-semibold",
        className,
      )}
    >
      {children}
    </div>
  );
}
