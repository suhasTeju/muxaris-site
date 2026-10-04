"use client";

import { useEffect, useRef } from "react";

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input,select,button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[color-mix(in_srgb,var(--color-ink)_45%,transparent)] p-0 sm:items-center sm:p-4">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bg-surface shadow-card max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl p-6 sm:rounded-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="font-display text-2xl">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted inline-flex size-11 items-center justify-center rounded-xl text-xl hover:bg-[color-mix(in_srgb,var(--color-ink)_5%,white)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const fieldClass =
  "border-line bg-surface min-h-11 w-full rounded-xl border px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]";
export const primaryBtn =
  "bg-accent text-on-accent hover:bg-accent-deep inline-flex min-h-11 items-center justify-center rounded-xl px-5 text-[15px] font-medium transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]";
export const ghostBtn =
  "border-line inline-flex min-h-11 items-center justify-center rounded-xl border px-4 text-[15px] transition-colors hover:bg-[color-mix(in_srgb,var(--color-ink)_5%,white)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]";
