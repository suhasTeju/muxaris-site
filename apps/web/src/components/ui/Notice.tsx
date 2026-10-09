import { CircleAlert, Info, Lock, type LucideIcon } from "lucide-react";
import { cn } from "./cn";

export type NoticeTone = "bad" | "warn" | "muted" | "info";

const TONE: Record<NoticeTone, { box: string; icon: LucideIcon }> = {
  /** Form and dialog errors. */
  bad: { box: "bg-rose-soft border border-rose-line text-rose-deep", icon: CircleAlert },
  /** Callback notes on a call. */
  warn: { box: "bg-amber-soft text-amber-deep", icon: Info },
  /** "Only the clinic owner can change this." */
  muted: { box: "bg-chip text-ink-2", icon: Lock },
  info: { box: "bg-teal-soft text-teal-ink", icon: Info },
};

export interface NoticeProps {
  tone?: NoticeTone;
  /** Replace the tone's default icon; pass null for none. */
  icon?: LucideIcon | null;
  /** Optional bold first line (14px/600), as in the Try-call error card. */
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * Inline message box: radius 10, 10px 12px, 13.5px, icon 15px. bad tone = role="alert".
 * Larger cards (Try errors: 14px 16px, radius 14) pass className overrides.
 */
export function Notice({ tone = "bad", icon, title, children, className }: NoticeProps) {
  const t = TONE[tone];
  const Icon = icon === null ? null : (icon ?? t.icon);
  return (
    <div
      role={tone === "bad" ? "alert" : undefined}
      className={cn(
        "flex gap-[10px] rounded-10 px-[12px] py-[10px] text-[13.5px] leading-[1.5]",
        title ? "items-start" : "items-center",
        t.box,
        className,
      )}
    >
      {Icon ? <Icon size={15} className={cn("shrink-0", title && "mt-[2px]")} /> : null}
      {title ? (
        <div className="flex flex-col gap-[3px]">
          <span className="text-[14px] font-semibold">{title}</span>
          <span>{children}</span>
        </div>
      ) : (
        <span>{children}</span>
      )}
    </div>
  );
}
