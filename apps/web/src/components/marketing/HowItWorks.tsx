import Image from "next/image";
import { cn } from "@/components/ui/cn";
import { STEPS } from "@/lib/content";
import { ANCHOR, CONTAINER, SECTION_X, SECTION_Y, SectionHeader } from "./SectionHeader";

export function HowItWorks() {
  return (
    <section id="how" className={cn(SECTION_X, SECTION_Y, ANCHOR)}>
      <div className={`${CONTAINER} flex flex-col gap-[40px] lg:gap-[56px]`}>
        <SectionHeader eyebrow="How it works" titleClassName="max-w-[640px]">
          From ring to booked in three steps.
        </SectionHeader>
        <ol className="m-0 grid list-none gap-[20px] p-0 lg:grid-cols-3">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className="border-line bg-surface flex flex-col gap-[22px] rounded-[26px] border px-[10px] pt-[10px] pb-[26px] sm:max-lg:grid sm:max-lg:grid-cols-[240px_minmax(0,1fr)] sm:max-lg:items-center sm:max-lg:pb-[10px]"
            >
              <div className="rounded-18 relative aspect-square overflow-hidden">
                <Image
                  src={s.img}
                  alt={s.alt}
                  fill
                  sizes="(min-width: 1280px) 380px, (min-width: 1024px) 30vw, (min-width: 640px) 240px, 100vw"
                  className="object-cover"
                />
                <span className="rounded-10 text-teal-ink absolute top-[12px] left-[12px] bg-[rgba(255,255,255,0.82)] px-[10px] py-[6px] font-mono text-[12px] leading-[1.5] backdrop-blur-[10px]">
                  {s.n}
                </span>
              </div>
              <div className="flex flex-col gap-[10px] px-[14px]">
                <h3 className="m-0 text-[22px] font-semibold tracking-[-0.02em]">{s.title}</h3>
                <p className="text-muted m-0 text-[15.5px] leading-[1.6]">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
