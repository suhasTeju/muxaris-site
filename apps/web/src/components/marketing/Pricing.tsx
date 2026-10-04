import Link from "next/link";
import { PLANS, PRICING_NOTE } from "@/lib/content";
import { Reveal } from "./Reveal";

export function Pricing({ heading = true }: { heading?: boolean }) {
  return (
    <section id="pricing" className="bg-surface scroll-mt-16">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
        {heading && (
          <Reveal className="max-w-2xl">
            <p className="text-accent-deep text-xs font-medium tracking-[0.16em] uppercase">
              Pricing
            </p>
            <h2 className="font-display mt-4 text-4xl leading-[1.05] font-medium tracking-[-0.03em] text-balance sm:text-5xl">
              One honest price. <span className="text-muted italic">Start free.</span>
            </h2>
          </Reveal>
        )}
        <div className={`grid gap-5 md:grid-cols-2 ${heading ? "mt-14" : ""}`}>
          {PLANS.map((p, i) => (
            <Reveal key={p.id} delay={i * 100}>
              <article
                data-plan={p.id}
                className={`flex h-full flex-col rounded-3xl p-7 sm:p-9 ${
                  p.highlight ? "bg-ink text-dark-text shadow-card" : "border-line bg-paper border"
                }`}
              >
                <h3 className="font-display text-2xl tracking-tight">{p.name}</h3>
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
                        className={`mt-0.5 ${p.highlight ? "text-accent-bright" : "text-accent-deep"}`}
                      >
                        ✓
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/#demo"
                  className={`mt-9 flex min-h-12 items-center justify-center rounded-full px-7 font-medium transition-colors ${
                    p.highlight
                      ? "bg-accent text-on-accent hover:bg-accent-bright hover:text-ink"
                      : "border-ink/20 hover:border-ink/50 border"
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
