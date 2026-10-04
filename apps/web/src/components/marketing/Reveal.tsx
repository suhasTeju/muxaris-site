"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Longest stagger a caller can ask for (ms); keeps lists feeling snappy. */
const MAX_DELAY = 180;

/**
 * Fades and lifts children into view once (220 ms, 10 px). Content already on screen at
 * mount appears instantly, and elements start revealing 15% of a viewport *before* they
 * scroll in, so nothing is ever seen half-faded. Reduced motion is handled in CSS
 * (`.mx-reveal` in globals.css); Shell adds a <noscript> rule for no-JS visitors.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "li" | "section";
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const show = (instant: boolean) => {
      if (instant) el.dataset.instant = "";
      el.dataset.in = "";
    };
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof IntersectionObserver === "undefined") {
      show(true);
      return;
    }
    if (el.getBoundingClientRect().top < window.innerHeight) {
      show(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          show(false);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px 15% 0px", threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      style={delay ? { transitionDelay: `${Math.min(delay, MAX_DELAY)}ms` } : undefined}
      className={`mx-reveal ${className}`}
    >
      {children}
    </Tag>
  );
}
