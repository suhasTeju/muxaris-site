import Link from "next/link";
import { PLANS, PRICING_NOTE } from "@/lib/content";
import { Reveal } from "./Reveal";
import { SectionHeader } from "./SectionHeader";

export function Pricing({ heading = true }: { heading?: boolean }) {
  // On /pricing the page H1 is followed directly by the plans, so they are h2s there.
  const PlanTitle = heading ? "h3" : "h2";
  return (
    <section id="pricing" className="bg-surface border-line scroll-mt-16 border-y">
      <div className="mx-container mx-section">
        {heading && (
          <SectionHeader eyebrow="Pricing" aside="Start free.">
            One honest price.
          </SectionHeader>
        )}
        <div className={`grid gap-5 md:grid-cols-2 ${heading ? "mt-12" : ""}`}>
          {PLANS.map((p, i) => (
            <Reveal key={p.id} delay={i * 50}>
              <article
                data-plan={p.id}
                className={`flex h-full flex-col p-7 sm:p-9 ${
                  p.highlight
                    ? "mx-dark rounded-card shadow-card mx-card-ring border"
                    : "mx-card bg-paper"
                }`}
              >
                <PlanTitle className="font-display text-2xl tracking-tight">{p.name}</PlanTitle>
                <p className="mt-6 flex items-baseline gap-2">
                  <span className="font-display text-6xl tracking-[-0.04em]">{p.price}</span>
                  <span className={p.highlight ? "text-dark-muted" : "text-muted"}>
                    {p.cadence}
                  </span>
                </p>
                <p className={`mt-4 ${p.highlight ? "text-dark-muted" : "text-muted"}`}>
                  {p.blurb}
                </p>
                <ul className="mt-8 flex-1 space-y-3">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-3 text-[0.95rem]">
                      <span
                        aria-hidden="true"
                        className={`mt-0.5 ${p.highlight ? "text-accent-bright" : "text-accent-ink"}`}
                      >
                        ✓
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/#demo"
                  className={`mx-btn mt-9 ${
                    p.highlight
                      ? "mx-btn-primary hover:!bg-accent-bright hover:!text-ink"
                      : "mx-btn-secondary"
                  }`}
                >
                  {p.cta}
                </Link>
              </article>
            </Reveal>
          ))}
        </div>
        <p className="font-display text-muted mt-8 max-w-2xl text-sm italic">{PRICING_NOTE}</p>
      </div>
    </section>
  );
}
