import { FAQS } from "@/lib/content";
import { SectionHeader } from "./SectionHeader";

export function Faq({ heading = true }: { heading?: boolean }) {
  return (
    <section id="faq" className="mx-container mx-section max-w-3xl scroll-mt-16">
      {heading && <SectionHeader eyebrow="FAQ">Questions clinics ask first.</SectionHeader>}
      <div className={`mx-card divide-line divide-y px-5 sm:px-7 ${heading ? "mt-12" : ""}`}>
        {FAQS.map((f) => (
          <details key={f.q} className="group">
            <summary className="font-display focus-visible:outline-accent flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-lg tracking-tight [&::-webkit-details-marker]:hidden">
              {f.q}
              <span
                aria-hidden="true"
                className="text-accent-ink text-2xl leading-none transition-transform group-open:rotate-45 motion-reduce:transition-none"
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
