import Image from "next/image";
import Link from "next/link";
import { HERO } from "@/lib/content";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-12 pb-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:pt-20 lg:pb-24">
        <div>
          <p className="text-[color-mix(in_oklch,var(--color-accent),black_25%)] text-xs font-medium tracking-[0.16em] uppercase">
            {HERO.eyebrow}
          </p>
          <h1 className="font-display mt-5 text-[2.6rem] leading-[1.02] font-medium tracking-[-0.035em] text-balance sm:text-6xl lg:text-[4.4rem]">
            Your front desk misses calls.{" "}
            <span className="text-[color-mix(in_oklch,var(--color-accent),black_25%)] italic">
              Muxaris doesn’t.
            </span>
          </h1>
          <p className="text-muted mt-6 max-w-xl text-lg leading-relaxed">{HERO.sub}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/#demo"
              className="bg-[color-mix(in_oklch,var(--color-accent),black_15%)] text-on-accent hover:bg-[color-mix(in_oklch,var(--color-accent),black_28%)] flex min-h-12 items-center justify-center rounded-full px-7 font-medium transition-colors"
            >
              Book a demo
            </Link>
            <Link
              href="/#live-demo"
              className="border-ink/15 hover:border-ink/40 flex min-h-12 items-center justify-center rounded-full border px-7 font-medium transition-colors"
            >
              Hear a sample call
            </Link>
          </div>
          <p className="font-display text-muted mt-6 text-sm italic">{HERO.note}</p>
        </div>
        <div className="relative">
          <div className="shadow-card relative aspect-[3/2] overflow-hidden rounded-[1.75rem]">
            <Image
              src="/img/hero-clinic.webp"
              alt="A quiet dental clinic reception in morning light, the phone handset slightly lifted as if a call is coming in"
              fill
              priority
              sizes="(min-width: 1024px) 540px, 100vw"
              className="object-cover"
            />
          </div>
          <div className="bg-surface border-line shadow-lift absolute -bottom-5 left-3 flex items-center gap-3 rounded-2xl border px-4 py-3 sm:left-[-1.5rem]">
            <span className="relative flex size-2.5">
              <span className="bg-accent absolute inline-flex size-full animate-ping rounded-full opacity-60 motion-reduce:animate-none" />
              <span className="bg-accent relative inline-flex size-2.5 rounded-full" />
            </span>
            <p className="text-sm">
              <span className="font-medium">Illustrative</span>
              <span className="text-muted"> · a call, answered by Muxaris</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
