import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "./cn";

export interface SectionHeaderProps {
  title: React.ReactNode;
  /** Optional "see all" link on the right, with the arrow. */
  link?: { href: string; label: string };
  /** Anything else for the right side (buttons, a saved tick, a badge). */
  action?: React.ReactNode;
  /**
   * md: dashboard cards (16px 18px, 15px title, -0.01em).
   * lg: settings and assistant cards (16px 20px, 15.5px title).
   */
  size?: "md" | "lg";
  /** Bottom rule #eef2f6 (default on). Off for cards whose header sits inside padding. */
  divider?: boolean;
  as?: "h2" | "h3";
  className?: string;
}

/** Card header row: title on the left, link or actions on the right. */
export function SectionHeader({
  title,
  link,
  action,
  size = "md",
  divider = true,
  as: Heading = "h2",
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-[12px] py-[16px]",
        size === "md" ? "px-[18px]" : "px-[20px]",
        divider && "border-chip border-b",
        className,
      )}
    >
      <Heading
        className={cn(
          "m-0 font-semibold",
          size === "md" ? "text-[15px] tracking-[-0.01em]" : "text-[15.5px]",
        )}
      >
        {title}
      </Heading>
      {link || action ? (
        <div className="flex items-center gap-[12px]">
          {action}
          {link ? (
            <Link
              href={link.href}
              className="flex items-center gap-[6px] text-[13px] font-medium whitespace-nowrap"
            >
              {link.label}
              <ArrowRight size={12} />
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
