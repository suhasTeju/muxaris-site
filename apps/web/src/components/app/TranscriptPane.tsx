"use client";

import { useEffect, useRef } from "react";
import { Card, cn } from "@/components/ui";

export interface TranscriptLine {
  role: "user" | "assistant";
  text: string;
}

/**
 * Try your assistant → Conversation: final transcript lines as chat bubbles, the caller ("You")
 * on the right and the assistant on the left. The newest line is scrolled into view, smoothly
 * unless the user prefers reduced motion (then it jumps, and the bubbles do not animate in).
 */
export function TranscriptPane({ lines, idle }: { lines: TranscriptLine[]; idle: boolean }) {
  const last = useRef<HTMLLIElement>(null);
  useEffect(() => {
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    last.current?.scrollIntoView?.({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [lines.length]);
  return (
    <Card radius={18} aria-labelledby="try-conversation" className="overflow-hidden">
      <div className="border-chip flex items-center justify-between gap-[12px] border-b px-[18px] py-[14px]">
        <h2 id="try-conversation" className="m-0 text-[15px] font-semibold">
          Conversation
        </h2>
      </div>
      <div className="flex min-h-[440px] flex-col gap-[14px] px-[18px] py-[20px] max-lg:min-h-[240px]">
        {lines.length === 0 ? (
          <div className="text-muted-2 grid min-h-[380px] flex-1 place-items-center max-lg:min-h-[180px] text-center text-[15px] italic">
            {idle ? "Say hello. The conversation appears here." : "The conversation appears here."}
          </div>
        ) : (
          <ol aria-live="polite" className="m-0 flex list-none flex-col gap-[14px] p-0">
            {lines.map((l, i) => {
              const me = l.role === "user";
              return (
                <li
                  key={i}
                  ref={i === lines.length - 1 ? last : undefined}
                  data-role={l.role}
                  className={cn(
                    "animate-mx-in flex max-w-[78%] flex-col gap-[5px] motion-reduce:animate-none",
                    me ? "items-end self-end" : "items-start self-start",
                  )}
                >
                  <span
                    className={cn(
                      "font-mono text-[11px] tracking-[0.05em]",
                      me ? "text-muted" : "text-teal-ink",
                    )}
                  >
                    {me ? "You" : "Assistant"}
                  </span>
                  <p
                    className={cn(
                      "text-ink m-0 border px-[14px] py-[11px] text-[15px] leading-[1.5] break-words",
                      me
                        ? "border-field bg-surface rounded-[14px_14px_4px_14px]"
                        : "border-teal-line bg-teal-tint rounded-[14px_14px_14px_4px]",
                    )}
                  >
                    {l.text}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </Card>
  );
}
