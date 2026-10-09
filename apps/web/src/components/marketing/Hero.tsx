import { ArrowRight, CalendarCheck, Play } from "lucide-react";
import Image from "next/image";
import { buttonClass } from "@/components/ui/Button";
import { HERO } from "@/lib/content";
import { SECTION_X } from "./SectionHeader";
import { SiteLink } from "./SiteLink";

const PULSE_DOT =
  "bg-signal size-[8px] shrink-0 rounded-full animate-[mxPulse10_2s_infinite] motion-reduce:animate-none";
const BAR_DELAYS = ["0s", ".15s", ".3s", ".45s", ".6s"];

export function Hero() {
  return (
    <section
      className={`relative overflow-hidden pt-[112px] pb-[64px] lg:pt-[150px] lg:pb-[88px] ${SECTION_X}`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(42% 50% at 82% 18%,rgba(14,154,150,0.16),transparent 70%),radial-gradient(36% 40% at 8% 90%,rgba(94,224,214,0.14),transparent 70%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(12,18,32,0.035) 1px,transparent 1px),linear-gradient(90deg,rgba(12,18,32,0.035) 1px,transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(60% 60% at 50% 30%,#000,transparent 80%)",
          WebkitMaskImage: "radial-gradient(60% 60% at 50% 30%,#000,transparent 80%)",
        }}
      />
      <div className="relative mx-auto grid max-w-[1200px] items-center gap-[48px] lg:grid-cols-[minmax(0,1.02fr)_minmax(0,1fr)] lg:gap-[64px]">
        <div className="flex flex-col gap-[28px]">
          <p className="border-line text-teal-ink rounded-pill m-0 inline-flex items-center gap-[10px] self-start border bg-[rgba(255,255,255,0.7)] py-[6px] pr-[12px] pl-[8px] font-mono text-[12px] font-medium tracking-[0.08em] uppercase">
            <span aria-hidden="true" className={PULSE_DOT} />
            {HERO.eyebrow}
          </p>
          <h1 className="m-0 text-[40px] sm:text-[clamp(48px,5.6vw,80px)] leading-[0.98] font-semibold tracking-[-0.048em] text-balance">
            Your front desk misses calls. <span className="text-teal">Muxaris doesn’t.</span>
          </h1>
          <p className="text-ink-3 m-0 max-w-[520px] text-[17px] leading-[1.55] text-pretty sm:text-[19px]">
            {HERO.sub}
          </p>
          <div className="flex flex-wrap gap-[12px]">
            <SiteLink href="/#demo" className={buttonClass({ size: 52, className: "shadow-cta" })}>
              Book a demo
              <ArrowRight size={16} aria-hidden className="shrink-0" />
            </SiteLink>
            <SiteLink
              href="/#live-demo"
              className={buttonClass({
                variant: "secondary",
                size: 52,
                className:
                  "pr-[22px] pl-[8px] font-semibold bg-[rgba(255,255,255,0.8)] hover:border-[#b9c3cf] hover:bg-surface",
              })}
            >
              <span className="rounded-10 bg-teal-soft text-teal-ink grid size-[36px] place-items-center">
                <Play size={14} aria-hidden />
              </span>
              Hear a sample call
            </SiteLink>
          </div>
          <p className="text-muted m-0 max-w-[440px] text-[14px]">{HERO.note}</p>
          <div className="border-line flex max-w-[480px] items-center gap-[14px] border-t pt-[20px]">
            <Image
              src="/brand/nvidia-inception-program-badge.svg"
              alt="NVIDIA Inception Program"
              width={83}
              height={36}
              className="block shrink-0"
            />
            <span className="text-muted text-[13.5px]">Member of the NVIDIA Inception Program</span>
          </div>
        </div>

        <div className="relative pt-[28px] pb-[36px] pl-[28px]">
          <div className="relative aspect-[4/4.3] overflow-hidden rounded-[28px] border border-[rgba(255,255,255,0.8)] shadow-[0_40px_80px_-36px_rgba(12,18,32,0.45)]">
            <Image
              src="/img/hero-clinic.webp"
              alt="A quiet dental clinic reception in morning light, the phone handset slightly lifted as if a call is coming in"
              fill
              priority
              fetchPriority="high"
              sizes="(min-width: 1024px) 560px, calc(100vw - 60px)"
              className="object-cover"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0"
              style={{ background: "linear-gradient(180deg,transparent 55%,rgba(12,18,32,0.35))" }}
            />
          </div>

          <div className="rounded-14 text-ink-2 absolute top-0 left-0 flex items-center gap-[10px] border border-[rgba(255,255,255,0.95)] bg-[rgba(255,255,255,0.78)] px-[14px] py-[10px] text-[13px] shadow-[0_16px_36px_-18px_rgba(12,18,32,0.35)] backdrop-blur-[16px]">
            <span aria-hidden="true" className={PULSE_DOT} />
            <span>
              <strong className="text-ink font-semibold">Illustrative</strong> · a call, answered by
              Muxaris
            </span>
          </div>

          <div
            aria-hidden="true"
            className="rounded-16 text-glass-text absolute top-[46%] left-0 sm:left-[-8px] flex animate-[mxFloat_6s_ease-in-out_infinite] items-center gap-[12px] border border-[rgba(255,255,255,0.14)] bg-[rgba(12,18,32,0.72)] px-[16px] py-[12px] shadow-[0_20px_40px_-18px_rgba(12,18,32,0.6)] backdrop-blur-[16px] motion-reduce:animate-none"
          >
            <div className="flex h-[22px] items-center gap-[3px]">
              {BAR_DELAYS.map((d) => (
                <span
                  key={d}
                  style={{ animationDelay: d }}
                  className="h-[22px] w-[3px] animate-[mxBar35_1s_ease-in-out_infinite] rounded-[2px] bg-[#5ee0d6] motion-reduce:animate-none"
                />
              ))}
            </div>
            <div className="flex flex-col">
              <span className="font-mono text-[11px] tracking-[0.08em] text-[#9fe9e2] uppercase">
                Muxaris
              </span>
              <span className="text-[14px]">Hello, Sunrise Dental Care</span>
            </div>
          </div>

          <div className="rounded-18 absolute right-0 bottom-0 sm:right-[-12px] flex w-[min(290px,calc(100%-16px))] items-start gap-[12px] border border-[rgba(255,255,255,0.95)] bg-[rgba(255,255,255,0.82)] p-[16px] shadow-[0_24px_48px_-20px_rgba(12,18,32,0.4)] backdrop-blur-[18px]">
            <span className="rounded-11 bg-green-soft text-green-ink grid size-[36px] flex-none place-items-center">
              <CalendarCheck size={18} aria-hidden />
            </span>
            <div className="flex flex-col gap-[2px]">
              <span className="text-green-ink font-mono text-[11px] tracking-[0.08em] uppercase">
                Booked · Sunrise Dental Care
              </span>
              <span className="text-[15px] font-semibold">Doctor Rao, tomorrow, 4:30 pm</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
