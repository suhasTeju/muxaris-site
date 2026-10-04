"use client";

import { useState } from "react";
import { GREETINGS } from "@/lib/content";

const css = `
@keyframes mx-marquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }
.mx-marquee-track { animation: mx-marquee 48s linear infinite; }
@media (prefers-reduced-motion: reduce) { .mx-marquee-track { animation: none; } }
`;

export function LanguageMarquee() {
  const [paused, setPaused] = useState(false);
  const items = [...GREETINGS, ...GREETINGS];
  return (
    <section
      aria-label="Greetings in five languages"
      className="border-line bg-surface relative overflow-hidden border-y py-5"
    >
      <style>{css}</style>
      <div
        className="mx-marquee-track flex w-max items-center gap-10 whitespace-nowrap"
        style={{ animationPlayState: paused ? "paused" : "running" }}
      >
        {items.map((g, i) => (
          <span
            key={`${g.code}-${i}`}
            aria-hidden={i >= GREETINGS.length ? true : undefined}
            className="font-display text-ink/70 flex items-center gap-10 text-xl italic"
          >
            {g.greeting.split(/[.?।]/)[0]}
            <span className="bg-accent size-1.5 rounded-full" />
          </span>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        className="bg-surface text-ink/70 hover:text-ink absolute top-1/2 right-2 flex min-h-11 -translate-y-1/2 items-center rounded-full border border-[var(--color-line)] px-4 text-xs shadow-sm motion-reduce:hidden"
      >
        {paused ? "Play scrolling" : "Pause scrolling"}
      </button>
    </section>
  );
}
