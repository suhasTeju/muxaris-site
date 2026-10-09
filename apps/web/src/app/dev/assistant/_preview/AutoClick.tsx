"use client";

import { useEffect } from "react";

/**
 * Development-only: after mount, clicks the buttons whose accessible name (aria-label, else text)
 * matches each entry, in order, so headless screenshots can show edit modes and drawers.
 */
export function AutoClick({ names }: { names: string[] }) {
  const key = names.join("|");
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      for (const name of key.split("|").filter(Boolean)) {
        await new Promise((r) => setTimeout(r, 60));
        if (cancelled) return;
        const el = [...document.querySelectorAll<HTMLElement>("button, a")].find(
          (b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").trim() === name,
        );
        el?.click();
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [key]);
  return null;
}
