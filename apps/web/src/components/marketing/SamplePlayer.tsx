"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui/cn";
import type { GREETINGS } from "@/lib/content";

const EVENT = "muxaris:audio-start";
const BAR_COUNT = 28;

/** The design's waveform: 28 bars whose heights depend on the row, so each language differs. */
export function barHeights(index: number): number[] {
  return Array.from(
    { length: BAR_COUNT },
    (_, i) => 6 + Math.round(Math.abs(Math.sin(i * 0.82 + index * 1.7)) * 20 + (i % 3) * 2),
  );
}

/**
 * One language row: native name, the greeting and a play button with a waveform that fills as
 * the real clip plays. Starting one clip pauses any other.
 */
export function SamplePlayer({
  greeting: g,
  index,
}: {
  greeting: (typeof GREETINGS)[number];
  index: number;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onOther = (e: Event) => {
      if ((e as CustomEvent).detail !== g.audio) audio.current?.pause();
    };
    window.addEventListener(EVENT, onOther);
    return () => window.removeEventListener(EVENT, onOther);
  }, [g.audio]);

  // Follow the clip every frame while it plays, so the bars fill smoothly.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const step = () => {
      const a = audio.current;
      if (a) setProgress(a.currentTime / (a.duration || g.seconds));
      frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [playing, g.seconds]);

  const toggle = () => {
    const el = audio.current;
    if (!el) return;
    if (el.paused) {
      window.dispatchEvent(new CustomEvent(EVENT, { detail: g.audio }));
      void el.play().catch(() => setPlaying(false));
    } else {
      el.pause();
    }
  };

  return (
    <li
      className={cn(
        "border-line grid items-center gap-[16px] border-t px-[20px] py-[22px] transition-colors duration-200 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-[24px] sm:px-[26px] sm:py-[24px]",
        playing ? "bg-surface" : "bg-transparent",
      )}
    >
      <div className="flex flex-col gap-[4px]">
        <span lang={g.code} className="text-[24px] leading-[1.2] font-semibold tracking-[-0.01em]">
          {g.native}
        </span>
        <span className="text-muted font-mono text-[12px] tracking-[0.06em] uppercase">
          {g.label}
        </span>
      </div>
      <div className="flex flex-col gap-[14px]">
        <p lang={g.code} className="text-ink-2 m-0 text-[16.5px] leading-[1.5]">
          “{g.greeting}”
        </p>
        <div className="flex items-center gap-[14px]">
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? "Pause" : `Play ${g.label} greeting`}
            className={cn(
              "rounded-12 grid size-[40px] flex-none cursor-pointer place-items-center text-white transition-all duration-200",
              playing ? "bg-teal" : "bg-ink",
            )}
          >
            {playing ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
          </button>
          <div aria-hidden="true" className="flex h-[32px] flex-1 items-center gap-[3px]">
            {barHeights(index).map((h, i) => (
              <span
                key={i}
                style={{ height: h }}
                className={cn(
                  "max-w-[6px] flex-1 rounded-[3px] transition-colors duration-[120ms] ease-linear",
                  playing && i / BAR_COUNT < progress
                    ? "bg-teal"
                    : playing
                      ? "bg-teal-hover"
                      : "bg-[#cfd7e0]",
                )}
              />
            ))}
          </div>
          <span className="text-muted min-w-[34px] text-right font-mono text-[12px]">
            {g.seconds.toFixed(1)}s
          </span>
        </div>
      </div>
      <audio
        ref={audio}
        src={g.audio}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
      />
    </li>
  );
}
