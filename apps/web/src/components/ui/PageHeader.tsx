import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "./cn";

export interface PageHeaderProps {
  title: React.ReactNode;
  /** Line under the title (14px #5f6b7c): clinic name, date range, count. */
  subtitle?: React.ReactNode;
  /** Right side, bottom-aligned with the title: primary action, segmented control, date chip. */
  actions?: React.ReactNode;
  /** Cap the title block width (Notifications uses 640, Try uses 720). */
  maxWidth?: number;
  className?: string;
}

/** Page title block every app page opens with: 26px/600, -0.03em, line-height 1.15. */
export function PageHeader({ title, subtitle, actions, maxWidth, className }: PageHeaderProps) {
  return (
    <div className={cn("flex items-end justify-between gap-[16px]", className)}>
      <div className="flex flex-col gap-[4px]" style={maxWidth ? { maxWidth } : undefined}>
        <h1 className="m-0 text-[26px] leading-[1.15] font-semibold tracking-[-0.03em]">{title}</h1>
        {subtitle ? <span className="text-muted text-[14px] leading-[1.5]">{subtitle}</span> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-[8px]">{actions}</div> : null}
    </div>
  );
}

/** "← Patients" back link above detail pages (13.5px/500 #4a5566, hover ink). */
export function BackLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "text-ink-3 hover:text-ink inline-flex items-center gap-[6px] self-start text-[13.5px] font-medium",
        className,
      )}
    >
      <ArrowLeft size={14} />
      {children}
    </Link>
  );
}
