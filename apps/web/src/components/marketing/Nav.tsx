"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { NAV_LINKS } from "@/lib/content";

export function Nav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="border-line sticky top-0 z-40 border-b bg-[color-mix(in_srgb,var(--color-paper)_88%,transparent)] backdrop-blur-md">
      <nav
        aria-label="Primary"
        className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6"
      >
        <Link href="/" aria-label="Muxaris home" className="flex min-h-11 items-center">
          <Image src="/brand/muxaris-wordmark.svg" alt="Muxaris" width={112} height={30} priority />
        </Link>

        <ul className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="text-ink/75 hover:text-ink flex min-h-11 items-center rounded-full px-3.5 text-sm transition-colors"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-2 md:flex">
          <Link
            href="/sign-in"
            className="text-ink/75 hover:text-ink flex min-h-11 items-center px-3 text-sm transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/#demo"
            className="bg-accent text-on-accent hover:bg-accent-deep flex min-h-11 items-center rounded-full px-5 text-sm font-medium transition-colors"
          >
            Book a demo
          </Link>
        </div>

        <button
          type="button"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
          className="text-ink -mr-2 flex size-11 items-center justify-center rounded-full md:hidden"
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
            {open ? (
              <path d="M5 5l12 12M17 5L5 17" stroke="currentColor" strokeWidth="1.8" />
            ) : (
              <path d="M3 7h16M3 15h16" stroke="currentColor" strokeWidth="1.8" />
            )}
          </svg>
        </button>
      </nav>

      {open && (
        <div id="mobile-menu" className="border-line bg-paper border-t md:hidden">
          <ul className="mx-auto flex max-w-6xl flex-col px-4 py-3 sm:px-6">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="font-display text-ink flex min-h-12 items-center text-xl tracking-tight"
                >
                  {l.label}
                </Link>
              </li>
            ))}
            <li className="mt-3 flex gap-3">
              <Link
                href="/sign-in"
                className="border-line flex min-h-12 flex-1 items-center justify-center rounded-full border text-sm"
              >
                Sign in
              </Link>
              <Link
                href="/#demo"
                onClick={() => setOpen(false)}
                className="bg-accent text-on-accent flex min-h-12 flex-1 items-center justify-center rounded-full text-sm font-medium"
              >
                Book a demo
              </Link>
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}
