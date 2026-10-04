import { PROBLEM } from "@/lib/content";
import { Reveal } from "./Reveal";

export function ProblemStats() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
      <Reveal>
        <h2 className="font-display max-w-2xl text-4xl leading-[1.05] font-medium tracking-[-0.03em] text-balance sm:text-5xl">
          {PROBLEM.title} <span className="text-muted italic">{PROBLEM.aside}</span>
        </h2>
      </Reveal>
      <ol className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-line bg-line md:grid-cols-3">
        {PROBLEM.moments.map((m, i) => (
          <Reveal as="li" key={m.when} delay={i * 90} className="bg-surface p-7 sm:p-9">
            <span className="font-display text-accent-deep text-5xl leading-none italic">
              {i + 1}
            </span>
            <h3 className="mt-6 text-sm font-medium tracking-[0.12em] uppercase">{m.when}</h3>
            <p className="text-muted mt-3 leading-relaxed">{m.text}</p>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}
