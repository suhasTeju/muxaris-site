"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, use, useEffect, useRef, useState } from "react";
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
import { useOptionalClinic } from "./clinic-context";
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

/** A value the layout streams as a promise, or a plain value (dev previews, tests). */
export type Streamed<T> = T | Promise<T>;

function isPromise<T>(v: Streamed<T>): v is Promise<T> {
  return typeof (v as { then?: unknown } | null)?.then === "function";
}

/** Renders `children` with the value, suspending until a streamed one resolves. */
function Resolve<T>({
  value,
  children,
}: {
  value: Streamed<T>;
  children: (v: T) => React.ReactNode;
}) {
  return children(isPromise(value) ? use(value) : value);
}

/** Client navigations refresh the badge and minutes at most this often. */
const REFRESH_AFTER_MS = 60_000;

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * 244px app sidebar: wordmark, nine nav items, and the minutes card. Sticky full height from
 * 1024px; below that it is an off-canvas panel opened from the header's menu button, which takes
 * focus when it opens and keeps Tab inside it until it closes.
 *
 * The badge and minutes come from the layout (streamed, so pages never wait on them) and from
 * router.refresh(). Client navigations refetch them only when they are a minute old, or when
 * leaving the Try page, where test calls use minutes.
 */
export function Sidebar({
  open,
  onNavigate,
  usage,
  openCallbacks,
}: {
  open: boolean;
  onNavigate: () => void;
  usage: Streamed<UsageSummary | null>;
  openCallbacks: Streamed<number | null>;
}) {
  const pathname = usePathname() ?? "";
  const api = useApi();
  // The pilot end date is the clinic's calendar day (Asia/Kolkata while the zone is unknown).
  const tz = useOptionalClinic()?.activeClinic.timezone;
  const asideRef = useRef<HTMLElement>(null);

  // Values refetched here. New server values (router.refresh, clinic switch) replace them.
  const [fetched, setFetched] = useState<{ usage?: UsageSummary; openCallbacks?: number }>({});
  const [source, setSource] = useState({ usage, openCallbacks });
  if (source.usage !== usage || source.openCallbacks !== openCallbacks) {
    setSource({ usage, openCallbacks });
    setFetched({});
  }

  // The layout's values are fresh when they arrive.
  const fetchedAt = useRef(0);
  useEffect(() => {
    fetchedAt.current = Date.now();
  }, [usage, openCallbacks]);

  const lastPath = useRef(pathname);
  useEffect(() => {
    const from = lastPath.current;
    lastPath.current = pathname;
    if (from === pathname) return;
    const leftTry = from.startsWith("/app/assistant/try");
    if (!leftTry && Date.now() - fetchedAt.current < REFRESH_AFTER_MS) return;
    // A failed refresh keeps the last good values.
    let live = true;
    api<{ total: number }>("/v1/callbacks?status=open&limit=1")
      .then((r) => {
        if (live && typeof r?.total === "number") {
          fetchedAt.current = Date.now();
          setFetched((f) => ({ ...f, openCallbacks: r.total }));
        }
      })
      .catch(() => undefined);
    api<unknown>("/v1/usage")
      .then((r) => {
        if (live && isUsageSummary(r)) setFetched((f) => ({ ...f, usage: r }));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [api, pathname]);

  // Off-canvas menu: focus its first link on open and keep Tab inside the panel.
  useEffect(() => {
    const aside = asideRef.current;
    if (!open || !aside) return;
    const items = () => [...aside.querySelectorAll<HTMLElement>(FOCUSABLE)];
    items()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = items();
      const first = list[0];
      const last = list[list.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !aside.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !aside.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const shownUsage = fetched.usage ?? usage;
  const shownCallbacks = fetched.openCallbacks ?? openCallbacks;

  return (
    <aside
      ref={asideRef}
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
              {item.href === "/app/callbacks" ? (
                <Suspense fallback={null}>
                  <Resolve value={shownCallbacks}>{(n) => <OpenBadge count={n ?? 0} />}</Resolve>
                </Suspense>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className="flex-1" />
      <Suspense fallback={<UsageCard usage={undefined} tz={tz} onNavigate={onNavigate} />}>
        <Resolve value={shownUsage}>
          {(u) => <UsageCard usage={u} tz={tz} onNavigate={onNavigate} />}
        </Resolve>
      </Suspense>
    </aside>
  );
}

function OpenBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={`${count} open`}
      className="bg-ink grid h-[20px] min-w-[22px] place-items-center rounded-pill px-[6px] font-mono text-[11px] text-white"
    >
      {count}
    </span>
  );
}

/** `usage` undefined while the layout's value is still on its way, null when it failed. */
function UsageCard({
  usage,
  tz,
  onNavigate,
}: {
  usage: UsageSummary | null | undefined;
  tz: string | undefined;
  onNavigate: () => void;
}) {
  const card = usage ? usageCard(usage, tz) : null;
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
        {card ? card.hint : usage === null ? "Couldn't load usage" : "\u00a0"}
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
