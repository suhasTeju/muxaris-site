"use client";

import Image from "next/image";

export function Topbar({
  open,
  onToggle,
  switcher,
  right,
}: {
  open: boolean;
  onToggle: () => void;
  switcher: React.ReactNode;
  right: React.ReactNode;
}) {
  return (
    <header className="border-line bg-surface flex items-center justify-between gap-4 border-b px-4 py-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-3 sm:gap-6">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls="app-sidebar"
          aria-label={open ? "Close menu" : "Open menu"}
          className="border-line inline-flex size-11 items-center justify-center rounded-xl border md:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path
              d="M2 4.5h14M2 9h14M2 13.5h14"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <Image
          src="/brand/muxaris-wordmark.svg"
          alt="Muxaris"
          width={110}
          height={29}
          priority
          className="hidden sm:block"
        />
        <div className="min-w-0 truncate">{switcher}</div>
      </div>
      <div className="flex items-center gap-4">{right}</div>
    </header>
  );
}
