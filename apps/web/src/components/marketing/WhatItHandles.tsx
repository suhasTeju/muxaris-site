import { CAPABILITIES, COMING_NEXT } from "@/lib/content";
import { Reveal } from "./Reveal";
import { SectionHeader } from "./SectionHeader";

/** Cards that carry the green ring: the two headline capabilities, one per row. */
const FEATURED = new Set([0, 4]);

export function WhatItHandles() {
  return (
    <section id="handles" data-theme="dark" className="mx-dark scroll-mt-16">
      <div className="mx-container mx-section">
        <SectionHeader eyebrow="What it handles" aside="Not just the easy calls.">
          The whole front-desk phone job.
        </SectionHeader>
        <ul className="mt-12 grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CAPABILITIES.map((c, i) => (
            <Reveal
              as="li"
              key={c.title}
              delay={(i % 4) * 40}
              className={`mx-card-dark flex flex-col p-6 sm:p-7 ${FEATURED.has(i) ? "mx-card-ring" : ""}`}
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
