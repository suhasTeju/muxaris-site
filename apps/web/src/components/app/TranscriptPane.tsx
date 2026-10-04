"use client";

import { useEffect, useRef } from "react";

export interface TranscriptLine {
  role: "user" | "assistant";
  text: string;
}

export function TranscriptPane({ lines, live }: { lines: TranscriptLine[]; live: boolean }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "end" });
  }, [lines.length]);
  return (
    <section
      aria-label="Transcript"
      className="border-line bg-surface flex min-h-64 flex-col gap-2 overflow-y-auto rounded-card border p-4 lg:max-h-[28rem]"
    >
      {lines.length === 0 ? (
        <p className="text-muted font-display m-auto text-center italic">
          {live ? "Say hello. The conversation appears here." : "The conversation appears here."}
        </p>
      ) : (
        <ol aria-live="polite" className="flex flex-col gap-2">
          {lines.map((l, i) => (
            <li
              key={i}
              data-role={l.role}
              className={`max-w-[85%] rounded-2xl px-4 py-2 text-[15px] ${
                l.role === "assistant"
                  ? "bg-accent-soft self-start"
                  : "border-line bg-paper self-end border"
              }`}
            >
              <span className="text-muted block text-xs">
                {l.role === "assistant" ? "Assistant" : "You"}
              </span>
              {l.text}
            </li>
          ))}
        </ol>
      )}
      <div ref={end} />
    </section>
  );
}
