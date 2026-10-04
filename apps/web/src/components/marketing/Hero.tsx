import Image from "next/image";
import Link from "next/link";
import { HERO } from "@/lib/content";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-container grid items-center gap-10 pt-12 pb-16 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:pt-20 lg:pb-28">
        <div>
          <p className="mx-eyebrow">{HERO.eyebrow}</p>
          <h1 className="font-display mt-5 text-[2.6rem] leading-[1.02] font-medium tracking-[-0.035em] text-balance sm:text-6xl lg:text-[4.4rem]">
            Your front desk misses calls.{" "}
            <span className="text-accent-ink italic">Muxaris doesn’t.</span>
          </h1>
          <p className="text-muted mt-6 max-w-xl text-lg leading-relaxed">{HERO.sub}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/#demo" className="mx-btn mx-btn-primary">
              Book a demo
            </Link>
            <Link href="/#live-demo" className="mx-btn mx-btn-secondary">
              Hear a sample call
            </Link>
          </div>
          <p className="text-muted mt-5 max-w-md text-sm leading-relaxed">{HERO.note}</p>
        </div>
        <div className="relative">
          <div className="shadow-card relative aspect-[3/2] overflow-hidden rounded-card">
            <Image
              src="/img/hero-clinic.webp"
              alt="A quiet dental clinic reception in morning light, the phone handset slightly lifted as if a call is coming in"
              fill
              priority
              sizes="(min-width: 1024px) 540px, calc(100vw - 32px)"
              fetchPriority="high"
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
