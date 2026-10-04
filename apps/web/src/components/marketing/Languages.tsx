import { GREETINGS } from "@/lib/content";
import { Reveal } from "./Reveal";
import { SectionHeader } from "./SectionHeader";
import { SamplePlayer } from "./SamplePlayer";

export function Languages() {
  return (
    <section id="languages" className="mx-container mx-section scroll-mt-20">
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <div>
          <SectionHeader
            eyebrow="Languages"
            className=""
            lede="Press play to hear the same clinic greeting in each language. These are the real clips Muxaris speaks, not mock-ups."
          >
            Greeted in the language they think in.
          </SectionHeader>
          <p className="font-display text-muted mt-4 italic">
            Callers can switch mid-call; Muxaris follows.
          </p>
        </div>
        <ul className="mx-card divide-line divide-y overflow-hidden">
          {GREETINGS.map((g, i) => (
            <Reveal as="li" key={g.code} delay={i * 40} className="p-5 sm:p-6">
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
