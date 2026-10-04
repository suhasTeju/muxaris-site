import { GREETINGS } from "@/lib/content";

const css = `
@keyframes mx-marquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }
.mx-marquee-track { animation: mx-marquee 48s linear infinite; }
@media (prefers-reduced-motion: reduce) { .mx-marquee-track { animation: none; } }
`;

export function LanguageMarquee() {
  const items = [...GREETINGS, ...GREETINGS];
  return (
    <section
      aria-label="Greetings in five languages"
      className="border-line overflow-hidden border-y bg-surface py-5"
    >
      <style>{css}</style>
      <div className="mx-marquee-track flex w-max items-center gap-10 whitespace-nowrap">
        {items.map((g, i) => (
          <span
            key={`${g.code}-${i}`}
            aria-hidden={i >= GREETINGS.length ? true : undefined}
            className="font-display text-ink/70 flex items-center gap-10 text-xl italic"
          >
            {g.greeting.split(/[.?।]/)[0]}
            <span className="bg-accent size-1.5 rounded-full" />
          </span>
        ))}
      </div>
    </section>
  );
}
