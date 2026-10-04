import { FAQS } from "@/lib/content";
import { Reveal } from "./Reveal";

export function Faq({ heading = true }: { heading?: boolean }) {
  return (
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-16 px-4 py-20 sm:px-6 lg:py-28">
      {heading && (
        <Reveal>
          <p className="text-[color-mix(in_oklch,var(--color-accent),black_25%)] text-xs font-medium tracking-[0.16em] uppercase">
            FAQ
          </p>
          <h2 className="font-display mt-4 text-4xl leading-[1.05] font-medium tracking-[-0.03em] text-balance sm:text-5xl">
            Questions clinics ask first.
          </h2>
        </Reveal>
      )}
      <div className={`border-line divide-line divide-y border-y ${heading ? "mt-12" : ""}`}>
        {FAQS.map((f) => (
          <details key={f.q} className="group">
            <summary className="font-display flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-lg tracking-tight [&::-webkit-details-marker]:hidden">
              {f.q}
              <span
                aria-hidden="true"
                className="text-[color-mix(in_oklch,var(--color-accent),black_25%)] text-2xl leading-none transition-transform group-open:rotate-45 motion-reduce:transition-none"
              >
                +
              </span>
            </summary>
            <p className="text-muted pb-6 leading-relaxed">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
