import Image from "next/image";
import { SPECIALTY_CARDS } from "@/lib/content";
import { Reveal } from "./Reveal";

export function WhoItsFor() {
  const [first, ...rest] = SPECIALTY_CARDS;
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
      <Reveal className="max-w-2xl">
        <p className="text-accent-deep text-xs font-medium tracking-[0.16em] uppercase">
          Who it’s for
        </p>
        <h2 className="font-display mt-4 text-4xl leading-[1.05] font-medium tracking-[-0.03em] text-balance sm:text-5xl">
          Built for dental clinics first.
        </h2>
        <p className="font-display text-muted mt-4 italic">
          Other specialties are in pilot. If your clinic books by phone, we’d like to hear from you.
        </p>
      </Reveal>
      <div className="mt-12 grid gap-4 lg:grid-cols-2">
        {first && (
          <Reveal className="relative min-h-80 overflow-hidden rounded-3xl lg:row-span-2 lg:min-h-full">
            <Image
              src={first.img}
              alt=""
              fill
              sizes="(min-width: 1024px) 560px, 100vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/10 to-transparent" />
            <div className="text-paper absolute inset-x-0 bottom-0 p-7">
              <span className="bg-accent text-on-accent rounded-full px-3 py-1 text-xs font-medium">
                {first.status}
              </span>
              <h3 className="font-display mt-3 text-3xl tracking-tight">{first.title}</h3>
              <p className="mt-2 max-w-sm text-sm text-white/80">{first.text}</p>
            </div>
          </Reveal>
        )}
        <ul className="grid gap-4 sm:grid-cols-2">
          {rest.map((s, i) => (
            <Reveal
              as="li"
              key={s.key}
              delay={i * 80}
              className="border-line bg-surface overflow-hidden rounded-3xl border"
            >
              <div className="relative aspect-[4/3]">
                <Image
                  src={s.img}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 280px, (min-width: 640px) 45vw, 100vw"
                  className="object-cover"
                />
              </div>
              <div className="p-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-xl tracking-tight">{s.title}</h3>
                  <span className="text-muted text-xs">{s.status}</span>
                </div>
                <p className="text-muted mt-2 text-sm leading-relaxed">{s.text}</p>
              </div>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
