import { CAPABILITIES, COMING_NEXT } from "@/lib/content";
import { Reveal } from "./Reveal";

export function WhatItHandles() {
  return (
    <section id="handles" className="bg-ink text-dark-text scroll-mt-16">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
        <Reveal className="max-w-2xl">
          <p className="text-accent-bright text-xs font-medium tracking-[0.16em] uppercase">
            What it handles
          </p>
          <h2 className="font-display mt-4 text-4xl leading-[1.05] font-medium tracking-[-0.03em] text-balance sm:text-5xl">
            The whole front-desk phone job.{" "}
            <span className="text-dark-muted italic">Not just the easy calls.</span>
          </h2>
        </Reveal>
        <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CAPABILITIES.map((c, i) => (
            <Reveal
              as="li"
              key={c.title}
              delay={(i % 4) * 70}
              className={`group rounded-3xl border border-white/10 bg-white/[0.04] p-6 transition-colors hover:border-accent-bright/40 sm:p-7 ${c.span}`}
            >
              <span className="font-display text-accent-bright text-sm italic">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="font-display mt-6 text-xl leading-snug tracking-tight">{c.title}</h3>
              <p className="text-dark-muted mt-3 text-[0.95rem] leading-relaxed">{c.text}</p>
            </Reveal>
          ))}
        </ul>
        <p className="font-display text-dark-muted mt-8 max-w-2xl text-sm italic">{COMING_NEXT}</p>
      </div>
    </section>
  );
}
