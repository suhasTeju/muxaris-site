"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useApi } from "@/lib/api-client";

export const NAV = [
  { href: "/app", label: "Overview", match: (p: string) => p === "/app" },
  {
    href: "/app/appointments",
    label: "Appointments",
    match: (p: string) => p.startsWith("/app/appointments"),
  },
  {
    href: "/app/patients",
    label: "Patients",
    match: (p: string) => p.startsWith("/app/patients"),
  },
  { href: "/app/calls", label: "Calls", match: (p: string) => p.startsWith("/app/calls") },
  {
    href: "/app/callbacks",
    label: "Callbacks",
    match: (p: string) => p.startsWith("/app/callbacks"),
  },
  {
    href: "/app/notifications",
    label: "Notifications",
    match: (p: string) => p.startsWith("/app/notifications"),
  },
  {
    href: "/app/assistant/try",
    label: "Assistant",
    match: (p: string) => p.startsWith("/app/assistant"),
  },
  { href: "/app/settings", label: "Settings", match: (p: string) => p.startsWith("/app/settings") },
] as const;

export function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const pathname = usePathname() ?? "";
  const api = useApi();
  const [openCallbacks, setOpenCallbacks] = useState(0);
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
  return (
    <nav
      id="app-sidebar"
      aria-label="Main"
      className={`border-line bg-surface w-full shrink-0 border-b md:block md:w-56 md:border-r md:border-b-0 ${open ? "block" : "hidden"}`}
    >
      <ul className="flex flex-col gap-1 p-3">
        {NAV.map((item) => {
          const active = item.match(pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-11 items-center rounded-xl px-3.5 text-[15px] transition-colors ${
                  active
                    ? "bg-accent-soft text-accent-deep before:bg-accent font-medium before:absolute before:inset-y-2.5 before:left-0 before:w-[3px] before:rounded-full"
                    : "text-muted hover:bg-[color-mix(in_srgb,var(--color-ink)_5%,white)] hover:text-[var(--color-ink)]"
                }`}
              >
                {item.label}
                {item.href === "/app/callbacks" && openCallbacks > 0 ? (
                  <span
                    aria-label={`${openCallbacks} open`}
                    className="bg-accent text-on-accent ml-auto rounded-full px-2 py-0.5 text-xs tabular-nums"
                  >
                    {openCallbacks}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
