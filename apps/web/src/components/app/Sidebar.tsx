"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  AudioLines,
  CalendarDays,
  ChartColumn,
  LayoutDashboard,
  Mail,
  Phone,
  PhoneCall,
  PhoneIncoming,
  Settings2,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { UsageSummary } from "@muxaris/shared";
import { useApi } from "@/lib/api-client";
import { ButtonLink } from "@/components/ui/Button";
import { UsageMeter, usageColors, usagePct } from "@/components/ui/UsageMeter";
import { Wordmark } from "@/components/ui/Wordmark";
import { cn } from "@/components/ui/cn";
import { isUsageSummary, usageCard } from "./usage";

export const NAV: ReadonlyArray<{
  href: string;
  label: string;
  icon: LucideIcon;
  match: (p: string) => boolean;
}> = [
  { href: "/app", label: "Overview", icon: LayoutDashboard, match: (p) => p === "/app" },
  {
    href: "/app/appointments",
    label: "Appointments",
    icon: CalendarDays,
    match: (p) => p.startsWith("/app/appointments"),
  },
  {
    href: "/app/patients",
    label: "Patients",
    icon: Users,
    match: (p) => p.startsWith("/app/patients"),
  },
  { href: "/app/calls", label: "Calls", icon: Phone, match: (p) => p.startsWith("/app/calls") },
  {
    href: "/app/analytics",
    label: "Analytics",
    icon: ChartColumn,
    match: (p) => p.startsWith("/app/analytics"),
  },
  {
    href: "/app/callbacks",
    label: "Callbacks",
    icon: PhoneIncoming,
    match: (p) => p.startsWith("/app/callbacks"),
  },
  {
    href: "/app/notifications",
    label: "Notifications",
    icon: Mail,
    match: (p) => p.startsWith("/app/notifications"),
  },
  {
    href: "/app/assistant",
    label: "Assistant",
    icon: AudioLines,
    match: (p) => p.startsWith("/app/assistant"),
  },
  {
    href: "/app/settings",
    label: "Settings",
    icon: Settings2,
    match: (p) => p.startsWith("/app/settings"),
  },
];

/**
 * 244px app sidebar: wordmark, nine nav items, and the minutes card. Sticky full height from
 * 1024px; below that it is an off-canvas panel opened from the header's menu button.
 */
export function Sidebar({
  open,
  onNavigate,
  initialUsage = null,
}: {
  open: boolean;
  onNavigate: () => void;
  /** Usage fetched by the layout; refreshed here on navigation. */
  initialUsage?: UsageSummary | null;
}) {
  const pathname = usePathname() ?? "";
  const api = useApi();
  const [openCallbacks, setOpenCallbacks] = useState(0);

  // A new server value (clinic switch, router.refresh) replaces whatever was fetched here.
  const [usage, setUsage] = useState(initialUsage);
  const [seenInitial, setSeenInitial] = useState(initialUsage);
  if (initialUsage !== seenInitial) {
    setSeenInitial(initialUsage);
    setUsage(initialUsage);
  }

  // Refreshed on navigation; a failure simply leaves no badge.
  useEffect(() => {
    let live = true;
    api<{ total: number }>("/v1/callbacks?status=open&limit=1")
      .then((r) => {
        if (live) setOpenCallbacks(r.total);
      })
      .catch(() => {
        if (live) setOpenCallbacks(0);
      });
    return () => {
      live = false;
    };
  }, [api, pathname]);

  // Minutes move after test calls, so refresh them on navigation too. The layout already fetched
  // them for the first render; a failed refresh keeps the last good value.
  const skipFirstUsage = useRef(initialUsage !== null);
  useEffect(() => {
    if (skipFirstUsage.current) {
      skipFirstUsage.current = false;
      return;
    }
    let live = true;
    api<unknown>("/v1/usage")
      .then((r) => {
        if (live && isUsageSummary(r)) setUsage(r);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [api, pathname]);

  return (
    <aside
      id="app-sidebar"
      className={cn(
        "border-line flex-col gap-[22px] border-r px-[14px] pt-[18px] pb-[16px] backdrop-blur-[18px]",
        "lg:sticky lg:top-0 lg:flex lg:h-screen",
        open ? "fixed inset-y-0 left-0 z-50 flex w-[244px] overflow-y-auto" : "hidden",
      )}
      style={{
        background: "linear-gradient(180deg, rgba(255,255,255,0.86), rgba(255,255,255,0.66))",
      }}
    >
      <Link href="/app" onClick={onNavigate} className="flex px-[8px] py-[4px]">
        <Wordmark width={108} />
      </Link>
      <nav aria-label="Main" className="flex flex-col gap-[2px]">
        {NAV.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          const count = item.href === "/app/callbacks" && openCallbacks > 0 ? openCallbacks : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-[38px] items-center gap-[11px] rounded-10 border px-[10px] text-[14px] transition-[background-color] duration-150 hover:bg-white hover:text-ink",
                active
                  ? "border-line bg-white text-ink shadow-nav font-semibold"
                  : "text-ink-3 border-transparent bg-transparent font-medium",
              )}
            >
              <Icon size={17} className={cn("shrink-0", active && "text-teal")} />
              <span className="flex-1">{item.label}</span>
              {count > 0 ? (
                <span
                  aria-label={`${count} open`}
                  className="bg-ink grid h-[20px] min-w-[22px] place-items-center rounded-pill px-[6px] font-mono text-[11px] text-white"
                >
                  {count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className="flex-1" />
      <UsageCard usage={usage} onNavigate={onNavigate} />
    </aside>
  );
}

function UsageCard({ usage, onNavigate }: { usage: UsageSummary | null; onNavigate: () => void }) {
  const card = usage ? usageCard(usage) : null;
  const pct = card ? usagePct(card.used, card.included) : 0;
  const colors = usageColors(pct);
  return (
    <div className="border-line flex flex-col gap-[12px] rounded-16 border bg-white p-[14px]">
      <div className="flex items-baseline justify-between">
        <span className="text-muted text-[12.5px]">Minutes used this month</span>
      </div>
      <div className="flex items-baseline gap-[6px]">
        <span className="text-[20px] font-semibold tracking-[-0.02em]">
          {card ? card.usedLabel : "–"}
        </span>
        {card ? <span className="text-muted text-[13px]">/ {card.includedLabel} min</span> : null}
      </div>
      <UsageMeter used={card?.used ?? 0} included={card?.included ?? 0} />
      <span className="text-[12px]" style={{ color: card ? colors.hint : "#5f6b7c" }}>
        {card ? card.hint : "Couldn't load usage"}
      </span>
      <ButtonLink
        href="/app/assistant/try"
        onClick={onNavigate}
        size={38}
        block
        icon={PhoneCall}
        iconSize={14}
        className="text-[13.5px]"
      >
        Try your assistant
      </ButtonLink>
    </div>
  );
}
