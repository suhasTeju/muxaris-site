import { GREETINGS } from "@/lib/content";
import { Reveal } from "./Reveal";
import { SamplePlayer } from "./SamplePlayer";

export function Languages() {
  return (
    <section id="languages" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 lg:py-28">
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <Reveal>
          <p className="text-[color-mix(in_oklch,var(--color-accent),black_25%)] text-xs font-medium tracking-[0.16em] uppercase">
            Languages
          </p>
          <h2 className="font-display mt-4 text-4xl leading-[1.05] font-medium tracking-[-0.03em] text-balance sm:text-5xl">
            Greeted in the language they think in.
          </h2>
          <p className="text-muted mt-5 leading-relaxed">
            Press play to hear the same clinic greeting in each language. These are the real clips
            Muxaris speaks, not mock-ups.
          </p>
          <p className="font-display text-muted mt-4 italic">
            Callers can switch mid-call; Muxaris follows.
          </p>
        </Reveal>
        <ul className="border-line divide-line bg-surface divide-y overflow-hidden rounded-3xl border">
          {GREETINGS.map((g, i) => (
            <Reveal as="li" key={g.code} delay={i * 60} className="p-5 sm:p-6">
              <div className="flex items-baseline justify-between gap-4">
                <p className="font-display text-2xl tracking-tight">{g.native}</p>
                <p className="text-muted text-sm">{g.label}</p>
              </div>
              <p className="text-ink/70 mt-2 mb-4 text-sm leading-relaxed">“{g.greeting}”</p>
              <SamplePlayer src={g.audio} label={g.label} />
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
