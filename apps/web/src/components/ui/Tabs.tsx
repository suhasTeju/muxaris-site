"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { useRef } from "react";
import { cn } from "./cn";

export interface TabItem {
  id: string;
  label: React.ReactNode;
  /** Count pill after the label (Geist Mono 11px; ink when selected, #eef2f6 otherwise). */
  count?: number | string;
  /** 14px icon before the label. */
  icon?: LucideIcon;
  /** Render the tab as a link (Assistant: Configure / Try your assistant). */
  href?: string;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange?: (id: string) => void;
  "aria-label": string;
  className?: string;
}

/**
 * Underline tabs (Callbacks, Notifications, Assistant): 40px tabs on a #e2e7ee rule, selected tab
 * gets a 2px ink underline and weight 600. Arrow keys move between button tabs.
 */
export function Tabs({ items, value, onChange, className, ...aria }: TabsProps) {
  const refs = useRef<Array<HTMLElement | null>>([]);
  function onKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (index + (e.key === "ArrowRight" ? 1 : -1) + items.length) % items.length;
    refs.current[next]?.focus();
    const item = items[next];
    if (item && !item.href) onChange?.(item.id);
  }
  return (
    <div role="tablist" {...aria} className={cn("border-line flex gap-[4px] border-b", className)}>
      {items.map((item, i) => {
        const on = item.id === value;
        const Icon = item.icon;
        const cls = cn(
          "-mb-px inline-flex h-[40px] cursor-pointer items-center gap-[8px] border-0 border-b-2 bg-transparent px-[14px] text-[14px] whitespace-nowrap",
          on
            ? "border-ink text-ink hover:text-ink font-semibold"
            : "text-muted hover:text-ink border-transparent font-medium",
        );
        const inner = (
          <>
            {Icon ? <Icon size={14} className="shrink-0" /> : null}
            {item.label}
            {item.count !== undefined ? (
              <span
                className={cn(
                  "grid h-[19px] min-w-[20px] place-items-center rounded-pill px-[6px] font-mono text-[11px]",
                  on ? "bg-ink text-white" : "bg-chip text-ink-3",
                )}
              >
                {item.count}
              </span>
            ) : null}
          </>
        );
        if (item.href) {
          return (
            <Link
              key={item.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              role="tab"
              aria-selected={on}
              href={item.href}
              className={cls}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              {inner}
            </Link>
          );
        }
        return (
          <button
            key={item.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange?.(item.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cls}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}
