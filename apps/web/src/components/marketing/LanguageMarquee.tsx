"use client";

import { Pause, Play } from "lucide-react";
import { useState } from "react";
import { MARQUEE } from "@/lib/content";

/** The greeting band under the hero. Two copies of the list scroll as one 48s loop. */
export function LanguageMarquee() {
  const [paused, setPaused] = useState(false);
  const label = paused ? "Play scrolling" : "Pause scrolling";
  return (
    <section
      aria-label="Greetings in five languages"
      className="border-line relative overflow-hidden border-y bg-[rgba(255,255,255,0.6)]"
    >
      <div
        className="flex w-max animate-[mxMarquee_48s_linear_infinite] motion-reduce:animate-none"
        style={{ animationPlayState: paused ? "paused" : "running" }}
      >
        {[...MARQUEE, ...MARQUEE].map((m, i) => (
          <div
            key={i}
            aria-hidden={i >= MARQUEE.length ? true : undefined}
            className="text-ink-2 flex items-center gap-[28px] px-[14px] py-[22px] text-[22px] font-medium tracking-[-0.01em] whitespace-nowrap"
          >
            <span>{m}</span>
            <span aria-hidden="true" className="bg-teal size-[6px] rounded-full opacity-60" />
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        aria-label={label}
        title={label}
        className="rounded-12 border-field text-ink-2 hover:bg-surface hover:text-ink absolute top-1/2 right-[16px] grid size-[40px] -translate-y-1/2 cursor-pointer place-items-center border bg-[rgba(255,255,255,0.92)] backdrop-blur-[8px] motion-reduce:hidden"
      >
        {paused ? <Play size={14} aria-hidden /> : <Pause size={14} aria-hidden />}
      </button>
    </section>
  );
}
