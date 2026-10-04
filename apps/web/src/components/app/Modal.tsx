"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

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
  const bodyRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Mount-only: focus the first field, trap Tab, lock page scroll, restore focus on close.
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const body = bodyRef.current;
    const first =
      body?.querySelector<HTMLElement>("[autofocus], input, select, textarea") ??
      body?.querySelector<HTMLElement>("button:not([disabled])") ??
      ref.current;
    first?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !ref.current) return;
      const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => !el.hasAttribute("disabled"),
      );
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = items[0]!;
      const lastEl = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === firstEl || !ref.current.contains(active))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && (active === lastEl || !ref.current.contains(active))) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      trigger?.focus();
    };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[color-mix(in_srgb,var(--color-ink)_45%,transparent)] p-0 sm:items-center sm:p-4">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="bg-surface shadow-card max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl p-6 sm:rounded-card"
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
        <div ref={bodyRef}>{children}</div>
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
