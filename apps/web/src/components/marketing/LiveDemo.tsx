"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { TryLive } from "./TryLive";
import { DEMO_STAGES, SAMPLE_CALL_DURATION, TRANSCRIPT } from "@/lib/content";

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

// Times (s) at which the visible state changes: transcript lines and stages after t=0.
const BOUNDARIES = [...new Set([...TRANSCRIPT.map((l) => l.at), ...DEMO_STAGES.map((x) => x.at)])]
  .filter((x) => x > 0)
  .sort((x, y) => x - y);
const LOOP_END = SAMPLE_CALL_DURATION + 3;

/**
 * Scripted three-stage demo. While the sample clip plays the clock follows the audio;
 * otherwise, once scrolled into view, a timer replays the same script silently.
 */
export function LiveDemo() {
  const root = useRef<HTMLElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const clock = useRef(0);
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [playing, setPlaying] = useState(false);
  const reduced = useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  );

  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), {
      threshold: 0.25,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => {
      const a = audio.current;
      if (a && !a.paused) {
        clock.current = a.currentTime;
      } else if (visible) {
        clock.current = clock.current + 0.2 >= LOOP_END ? 0 : clock.current + 0.2;
      }
      // Re-render only when a stage or transcript line changes.
      const next = BOUNDARIES.filter((x) => clock.current >= x).length;
      setStep((prev) => (prev === next ? prev : next));
    }, 200);
    return () => window.clearInterval(id);
  }, [visible, reduced]);

  const t = reduced ? SAMPLE_CALL_DURATION : step === 0 ? 0 : BOUNDARIES[step - 1]!;
  const stageIndex = DEMO_STAGES.reduce((acc, s, i) => (t >= s.at ? i : acc), 0);
  const lines = TRANSCRIPT.filter((l) => t >= l.at);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) {
      void a.play().catch(() => {});
    } else {
      a.pause();
    }
  };

  return (
    <section
      id="live-demo"
      ref={root}
      className="bg-ink-deep text-dark-text relative scroll-mt-16 overflow-hidden"
    >
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
        <div className="max-w-2xl">
          <p className="text-accent-bright text-xs font-medium tracking-[0.16em] uppercase">
            Live demo
          </p>
          <h2 className="font-display mt-4 text-4xl leading-[1.05] font-medium tracking-[-0.03em] text-balance sm:text-5xl">
            One call, start to finish.{" "}
            <span className="text-dark-muted italic">Twenty seconds.</span>
          </h2>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <ol className="space-y-3">
            {DEMO_STAGES.map((s, i) => {
              const done = i < stageIndex;
              const active = i === stageIndex;
              return (
                <li
                  key={s.id}
                  aria-current={active ? "step" : undefined}
                  className={`flex items-start gap-4 rounded-2xl border p-5 transition-colors duration-500 motion-reduce:transition-none ${
                    active
                      ? "border-accent-bright/50 bg-white/[0.06]"
                      : "border-white/10 bg-white/[0.02]"
                  }`}
                >
                  <span
                    className={`font-display flex size-9 shrink-0 items-center justify-center rounded-full text-lg italic transition-colors duration-500 motion-reduce:transition-none ${
                      done || active
                        ? "bg-[color-mix(in_oklch,var(--color-accent),black_15%)] text-on-accent"
                        : "bg-white/10 text-dark-muted"
                    }`}
                  >
                    {done ? "✓" : i + 1}
                  </span>
                  <div>
                    <p className="font-medium">{s.title}</p>
                    <p className="text-dark-muted mt-1 text-sm">{s.text}</p>
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 sm:p-7">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <p className="font-medium">Sunrise Dental Care</p>
                <p className="text-dark-muted text-sm">Sample call · English</p>
              </div>
              <button
                type="button"
                onClick={toggle}
                className="bg-[color-mix(in_oklch,var(--color-accent),black_15%)] text-on-accent hover:bg-[color-mix(in_oklch,var(--color-accent),black_28%)] flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-medium transition-colors"
              >
                {playing ? "Pause audio" : "Play audio"}
              </button>
            </div>
            <div
              className="mt-5 flex min-h-72 flex-col gap-3"
              role="log"
              aria-live="off"
              aria-label="Call transcript"
            >
              {lines.map((l) => (
                <p
                  key={l.at}
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-[0.95rem] leading-relaxed ${
                    l.who === "caller"
                      ? "self-start bg-white/10"
                      : "bg-[color-mix(in_oklch,var(--color-accent),black_15%)] text-on-accent self-end"
                  }`}
                >
                  <span className="mb-0.5 block text-[0.65rem] font-medium tracking-[0.14em] uppercase opacity-70">
                    {l.who === "caller" ? "Caller" : "Muxaris"}
                  </span>
                  {l.text}
                </p>
              ))}
            </div>
            <audio
              ref={audio}
              src="/audio/sample-call.m4a"
              preload="none"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => {
                setPlaying(false);
                clock.current = 0;
              }}
            />
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
          <TryLive />
          <Link
            href="/#demo"
            className="flex min-h-12 items-center justify-center rounded-full border border-white/25 px-7 font-medium transition-colors hover:border-white/60"
          >
            Book a demo
          </Link>
        </div>
      </div>
    </section>
  );
}
