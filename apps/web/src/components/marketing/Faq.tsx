"use client";

import { Minus, Plus } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/components/ui/cn";
import { FAQS } from "@/lib/content";
import { ANCHOR, CONTAINER, SECTION_X, SectionHeader } from "./SectionHeader";

/**
 * Accordion of the eight questions; one answer open at a time, the first open on arrival. On the
 * home page it has its own sticky heading; on /faq it sits under the page H1.
 */
export function Faq({ heading = true }: { heading?: boolean }) {
  const [open, setOpen] = useState(0);
  const base = useId();
  const Q = heading ? "h3" : "h2";
  return (
    <section
      id="faq"
      className={cn(
        SECTION_X,
        ANCHOR,
        heading
          ? "border-line bg-surface border-t py-[80px] lg:py-[128px]"
          : "pt-[48px] pb-[96px] lg:pt-[56px] lg:pb-[120px]",
      )}
    >
      <div
        className={cn(
          CONTAINER,
          "grid items-start gap-[40px] lg:gap-[72px]",
          heading && "lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]",
        )}
      >
        {heading && (
          <SectionHeader eyebrow="FAQ" className="lg:sticky lg:top-[120px]">
            Questions clinics ask first.
          </SectionHeader>
        )}
        <div className="flex max-w-[820px] flex-col gap-[10px]">
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            const answerId = `${base}-a${i}`;
            return (
              <div
                key={f.q}
                className={cn(
                  "bg-surface overflow-hidden rounded-[18px] border transition-all duration-200",
                  isOpen
                    ? "border-teal-hover shadow-[0_18px_40px_-26px_rgba(12,18,32,0.3)]"
                    : "border-line",
                )}
              >
                <Q className="m-0 text-[17px] leading-[1.5] font-medium tracking-[-0.01em]">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={answerId}
                    onClick={() => setOpen(isOpen ? -1 : i)}
                    className="text-ink flex w-full cursor-pointer items-center justify-between gap-[20px] border-none bg-transparent px-[22px] py-[20px] text-left"
                  >
                    {f.q}
                    <span
                      aria-hidden="true"
                      className={cn(
                        "grid size-[28px] flex-none place-items-center rounded-[9px] transition-all duration-200",
                        isOpen ? "bg-teal text-white" : "bg-chip text-ink-2",
                      )}
                    >
                      {isOpen ? <Minus size={14} /> : <Plus size={14} />}
                    </span>
                  </button>
                </Q>
                <p
                  id={answerId}
                  hidden={!isOpen}
                  className="text-ink-3 m-0 animate-[mxIn8_.25s_ease_both] pr-[22px] pb-[22px] pl-[22px] text-[15.5px] leading-[1.65] motion-reduce:animate-none sm:pr-[70px]"
                >
                  {f.a}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
