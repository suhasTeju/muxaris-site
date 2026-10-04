import { PROBLEM } from "@/lib/content";
import { Reveal } from "./Reveal";
import { SectionHeader } from "./SectionHeader";

export function ProblemStats() {
  return (
    <section className="mx-container mx-section">
      <SectionHeader eyebrow="The problem" aside={PROBLEM.aside}>
        {PROBLEM.title}
      </SectionHeader>
      <ol className="mt-12 grid gap-4 md:grid-cols-3">
        {PROBLEM.moments.map((m, i) => (
          <Reveal as="li" key={m.when} delay={i * 50} className="mx-card p-7 sm:p-8">
            <span className="font-display text-accent-ink text-5xl leading-none italic">
              {i + 1}
            </span>
            <h3 className="mt-6 text-sm font-semibold tracking-[0.12em] uppercase">{m.when}</h3>
            <p className="text-muted mt-3 leading-relaxed">{m.text}</p>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}
