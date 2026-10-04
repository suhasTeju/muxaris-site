import Image from "next/image";
import { STEPS } from "@/lib/content";
import { Reveal } from "./Reveal";

export function HowItWorks() {
  return (
    <section id="how" className="bg-surface scroll-mt-16">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
        <Reveal className="max-w-2xl">
          <p className="text-[color-mix(in_oklch,var(--color-accent),black_25%)] text-xs font-medium tracking-[0.16em] uppercase">
            How it works
          </p>
          <h2 className="font-display mt-4 text-4xl leading-[1.05] font-medium tracking-[-0.03em] text-balance sm:text-5xl">
            From ring to booked in three steps.
          </h2>
        </Reveal>
        <ol className="mt-14 grid gap-12 md:grid-cols-3 md:gap-8">
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.n} delay={i * 110}>
              <div className="relative aspect-square overflow-hidden rounded-3xl">
                <Image
                  src={s.img}
                  alt={s.alt}
                  fill
                  sizes="(min-width: 768px) 360px, 100vw"
                  className="object-cover"
                />
              </div>
              <p className="font-display text-[color-mix(in_oklch,var(--color-accent),black_25%)] mt-6 text-3xl italic">
                {s.n}
              </p>
              <h3 className="font-display mt-1 text-2xl tracking-tight">{s.title}</h3>
              <p className="text-muted mt-3 leading-relaxed">{s.text}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
