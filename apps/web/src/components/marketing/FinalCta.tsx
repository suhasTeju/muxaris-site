import { CITIES, LANGUAGES, SPECIALTIES, SPECIALTY_LABELS } from "@muxaris/shared";
import { DemoForm } from "./DemoForm";
import { Reveal } from "./Reveal";

export function FinalCta() {
  return (
    <section id="demo" data-theme="dark" className="mx-dark border-t border-white/10 scroll-mt-16">
      <div className="mx-container mx-section grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <Reveal>
          <p className="mx-eyebrow">Book a demo</p>
          <h2 className="mx-h2">
            Hear how it <span className="text-accent-bright italic">answers.</span>
          </h2>
          <p className="mx-lede max-w-md text-base">
            Tell us about your clinic. We’ll set up a short walkthrough, and if you’re one of the
            first 10 Bengaluru clinics, a free 30-day pilot. Today the live product is a browser
            call; clinic phone numbers are coming soon.
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
