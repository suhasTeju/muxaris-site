"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const NAV = [
  { href: "/app", label: "Overview", match: (p: string) => p === "/app" },
  {
    href: "/app/appointments",
    label: "Appointments",
    match: (p: string) => p.startsWith("/app/appointments"),
  },
  { href: "/app/calls", label: "Calls", match: (p: string) => p.startsWith("/app/calls") },
  {
    href: "/app/assistant/try",
    label: "Assistant",
    match: (p: string) => p.startsWith("/app/assistant"),
  },
  { href: "/app/settings", label: "Settings", match: (p: string) => p.startsWith("/app/settings") },
] as const;

export function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const pathname = usePathname() ?? "";
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
                className={`flex min-h-11 items-center rounded-xl px-3 text-[15px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] ${
                  active
                    ? "bg-accent-soft text-accent-deep font-medium"
                    : "text-muted hover:bg-[color-mix(in_srgb,var(--color-ink)_5%,white)] hover:text-[var(--color-ink)]"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
