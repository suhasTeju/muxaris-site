"use client";

import { useEffect, useRef, useState } from "react";

const BARS = [
  0.35, 0.6, 0.45, 0.8, 0.55, 0.9, 0.5, 0.7, 0.95, 0.6, 0.4, 0.75, 0.85, 0.5, 0.65, 0.9, 0.45, 0.7,
  0.55, 0.8, 0.4, 0.6, 0.75, 0.5, 0.85, 0.45, 0.65, 0.35,
];
const EVENT = "muxaris:audio-start";

/** Play/pause button with a waveform-style progress bar. One clip plays at a time. */
export function SamplePlayer({ src, label }: { src: string; label: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = audio.current;
    const onOther = (e: Event) => {
      if ((e as CustomEvent).detail !== src) el?.pause();
    };
    window.addEventListener(EVENT, onOther);
    return () => window.removeEventListener(EVENT, onOther);
  }, [src]);

  const toggle = () => {
    const el = audio.current;
    if (!el) return;
    if (el.paused) {
      window.dispatchEvent(new CustomEvent(EVENT, { detail: src }));
      void el.play().catch(() => setPlaying(false));
    } else {
      el.pause();
    }
  };

  const filled = Math.round(progress * BARS.length);

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={toggle}
        aria-label={`${playing ? "Pause" : "Play"} ${label} greeting`}
        className="bg-ink text-paper hover:bg-accent-btn-hover flex size-11 shrink-0 items-center justify-center rounded-full transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
          {playing ? (
            <path d="M3 1.5h2.6v11H3zM8.4 1.5H11v11H8.4z" />
          ) : (
            <path d="M3.5 1.5v11l9-5.5z" />
          )}
        </svg>
      </button>
      <div className="flex h-9 flex-1 items-center gap-[3px]" aria-hidden="true">
        {BARS.map((h, i) => (
          <span
            key={i}
            style={{ height: `${h * 100}%` }}
            className={`w-[3px] flex-1 rounded-full transition-colors duration-150 motion-reduce:transition-none ${
              i < filled ? "bg-accent" : "bg-ink/15"
            }`}
          />
        ))}
      </div>
      <audio
        ref={audio}
        src={src}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
        onTimeUpdate={(e) => {
          const a = e.currentTarget;
          setProgress(a.duration ? a.currentTime / a.duration : 0);
        }}
      />
    </div>
  );
}
