import { CITIES, LANGUAGES, SPECIALTIES, SPECIALTY_LABELS } from "@muxaris/shared";
import { DemoForm } from "./DemoForm";
import { Reveal } from "./Reveal";

export function FinalCta() {
  return (
    <section id="demo" className="bg-ink-deep text-dark-text scroll-mt-16">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 lg:py-28">
        <Reveal>
          <p className="text-accent-bright text-xs font-medium tracking-[0.16em] uppercase">
            Book a demo
          </p>
          <h2 className="font-display mt-4 text-4xl leading-[1.05] font-medium tracking-[-0.03em] text-balance sm:text-5xl">
            Hear it answer <span className="text-accent-bright italic">your</span> phone.
          </h2>
          <p className="text-dark-muted mt-5 max-w-md leading-relaxed">
            Tell us about your clinic. We’ll set up a short walkthrough, and if you’re one of the
            first 10 Bengaluru clinics, a free 30-day pilot.
          </p>
          <p className="font-display text-dark-muted mt-6 italic">
            We reply within one working day.
          </p>
        </Reveal>
        <Reveal delay={100}>
          <DemoForm
            cities={[...CITIES]}
            specialties={SPECIALTIES.map((s) => ({ value: s, label: SPECIALTY_LABELS[s] }))}
            languages={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
          />
        </Reveal>
      </div>
    </section>
  );
}
