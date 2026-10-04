import Image from "next/image";
import { STEPS } from "@/lib/content";
import { Reveal } from "./Reveal";
import { SectionHeader } from "./SectionHeader";

export function HowItWorks() {
  return (
    <section id="how" className="bg-surface border-line scroll-mt-16 border-y">
      <div className="mx-container mx-section">
        <SectionHeader eyebrow="How it works">From ring to booked in three steps.</SectionHeader>
        <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.n} delay={i * 50}>
              <div className="rounded-card border-line relative aspect-square overflow-hidden border">
                <Image
                  src={s.img}
                  alt={s.alt}
                  fill
                  sizes="(min-width: 768px) 360px, 100vw"
                  className="object-cover"
                />
              </div>
              <p className="font-display text-accent-ink mt-6 text-3xl italic">{s.n}</p>
              <h3 className="font-display mt-1 text-2xl tracking-tight">{s.title}</h3>
              <p className="text-muted mt-3 leading-relaxed">{s.text}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
