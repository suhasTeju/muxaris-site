import Image from "next/image";
import { cn } from "@/components/ui/cn";
import { SPECIALTY_CARDS } from "@/lib/content";
import { CONTAINER, SECTION_X, SECTION_Y, SectionHeader } from "./SectionHeader";

const PILL = "rounded-pill font-mono tracking-[0.08em] uppercase whitespace-nowrap";

export function WhoItsFor() {
  const [first, ...rest] = SPECIALTY_CARDS;
  return (
    <section className={cn("border-line bg-surface border-t", SECTION_X, SECTION_Y)}>
      <div className={`${CONTAINER} flex flex-col gap-[40px] lg:gap-[56px]`}>
        <div className="grid items-end gap-[20px] lg:grid-cols-2 lg:gap-[48px]">
          <SectionHeader eyebrow="Who it’s for">Built for dental clinics first.</SectionHeader>
          <p className="text-muted m-0 max-w-[440px] text-[17px] leading-[1.6] text-pretty lg:justify-self-end">
            Dental first. Other specialties coming next. If your clinic books by phone, we’d like to
            hear from you.
          </p>
        </div>
        <ul className="m-0 grid list-none gap-[16px] p-0 md:grid-cols-2 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-[auto_auto]">
          {first && (
            <li className="border-line relative min-h-[480px] overflow-hidden rounded-[26px] border md:col-span-2 lg:col-span-1 lg:row-span-2 lg:min-h-[620px]">
              <Image
                src={first.img}
                alt=""
                fill
                sizes="(min-width: 1024px) 440px, 100vw"
                className="object-cover"
              />
              <div className="rounded-20 absolute right-[16px] bottom-[16px] left-[16px] flex flex-col gap-[10px] border border-[rgba(255,255,255,0.95)] bg-[rgba(255,255,255,0.8)] p-[22px] backdrop-blur-[18px]">
                <span
                  className={`${PILL} bg-green-soft text-green-ink inline-flex items-center gap-[6px] self-start px-[10px] py-[4px] text-[11px]`}
                >
                  <span aria-hidden="true" className="bg-signal size-[6px] rounded-full" />
                  {first.status}
                </span>
                <h3 className="m-0 text-[28px] font-semibold tracking-[-0.03em]">{first.title}</h3>
                <p className="text-ink-3 m-0 text-[15.5px] leading-[1.55]">{first.text}</p>
              </div>
            </li>
          )}
          {rest.map((s) => (
            <li
              key={s.key}
              className="border-line bg-subtle flex flex-col gap-[16px] rounded-[24px] border px-[8px] pt-[8px] pb-[20px]"
            >
              <div className="relative aspect-[16/10] overflow-hidden rounded-[17px]">
                <Image
                  src={s.img}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 360px, (min-width: 768px) 45vw, 100vw"
                  className="object-cover saturate-[0.85]"
                />
              </div>
              <div className="flex flex-col gap-[8px] px-[12px]">
                <div className="flex items-center justify-between gap-[10px]">
                  <h3 className="m-0 text-[18px] font-semibold tracking-[-0.015em]">{s.title}</h3>
                  <span className={`${PILL} bg-chip text-muted px-[9px] py-[3px] text-[10.5px]`}>
                    {s.status}
                  </span>
                </div>
                <p className="text-muted m-0 text-[14.5px] leading-[1.55]">{s.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
