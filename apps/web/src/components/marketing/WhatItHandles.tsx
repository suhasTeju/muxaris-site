import { cn } from "@/components/ui/cn";
import { CAPABILITIES, COMING_NEXT } from "@/lib/content";
import { ANCHOR, CONTAINER, SECTION_X, SECTION_Y, SectionHeader } from "./SectionHeader";

export function WhatItHandles() {
  return (
    <section id="handles" className={cn("border-line border-t", SECTION_X, SECTION_Y, ANCHOR)}>
      <div className={`${CONTAINER} flex flex-col gap-[40px] lg:gap-[56px]`}>
        <SectionHeader
          eyebrow="What it handles"
          aside="Not just the easy calls."
          titleClassName="max-w-[820px]"
        >
          The whole front-desk phone job.
        </SectionHeader>
        <ul className="border-line bg-line m-0 grid list-none gap-px overflow-hidden rounded-[26px] border p-0 sm:grid-cols-2 lg:grid-cols-4">
          {CAPABILITIES.map((c, i) => (
            <li
              key={c.title}
              className="bg-surface flex flex-col gap-[24px] px-[24px] pt-[26px] pb-[30px] transition-colors hover:bg-[#fbfdfd] sm:min-h-[220px] sm:gap-[40px] lg:min-h-[250px]"
            >
              <span className="text-teal-ink font-mono text-[12px]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="flex flex-col gap-[10px]">
                <h3 className="m-0 text-[18px] leading-[1.3] font-semibold tracking-[-0.015em]">
                  {c.title}
                </h3>
                <p className="text-muted m-0 text-[14.5px] leading-[1.6]">{c.text}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="text-muted m-0 flex flex-wrap items-center gap-[10px] text-[15px]">
          <span className="rounded-pill bg-teal-soft text-teal-ink px-[10px] py-[4px] font-mono text-[11px] tracking-[0.08em] uppercase">
            Coming next
          </span>
          {COMING_NEXT}
        </p>
      </div>
    </section>
  );
}
