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
  const stageIndex = DEMO_STAGES.reduce((acc, x, i) => (t >= x.at ? i : acc), 0);
  // Index of the line being spoken right now; later lines are shown but not yet "live".
  const activeLine = TRANSCRIPT.reduce((acc, l, i) => (t >= l.at ? i : acc), 0);
  const booked = t >= (DEMO_STAGES[1]?.at ?? Infinity);
  const bookingStage = DEMO_STAGES[1];

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
      data-theme="dark"
      className="mx-dark relative scroll-mt-16 overflow-hidden"
    >
      <div className="mx-container mx-section">
        <div className="max-w-2xl">
          <p className="mx-eyebrow">Live demo</p>
          <h2 className="mx-h2">
            One call, start to finish.{" "}
            <span className="text-dark-muted italic">Twenty seconds.</span>
          </h2>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-8">
          <ol className="space-y-3">
            {DEMO_STAGES.map((s, i) => {
              const done = i < stageIndex;
              const active = i === stageIndex;
              return (
                <li
                  key={s.id}
                  aria-current={active ? "step" : undefined}
                  className={`mx-card-dark flex items-start gap-4 p-5 ${active ? "mx-card-ring" : ""}`}
                >
                  <span
                    className={`font-display flex size-9 shrink-0 items-center justify-center rounded-full text-lg italic transition-colors duration-300 motion-reduce:transition-none ${
                      done || active
                        ? "bg-accent-btn text-on-accent"
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

          <div className="mx-card-dark p-5 sm:p-7">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <p className="font-medium">Sunrise Dental Care</p>
                <p className="text-dark-muted text-sm">Sample call · English</p>
              </div>
              <button
                type="button"
                onClick={toggle}
                className="mx-btn mx-btn-primary min-h-11 gap-2 px-5 text-sm"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 14 14"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  {playing ? (
                    <path d="M3 1.5h2.6v11H3zM8.4 1.5H11v11H8.4z" />
                  ) : (
                    <path d="M3.5 1.5v11l9-5.5z" />
                  )}
                </svg>
                {playing ? "Pause audio" : "Play audio"}
              </button>
            </div>
            <ol className="mt-5 flex flex-col gap-3" aria-label="Call transcript">
              {TRANSCRIPT.map((l, i) => (
                <li
                  key={l.at}
                  aria-current={i === activeLine ? "true" : undefined}
                  className={`rounded-inner max-w-[88%] px-4 py-3 text-[0.95rem] leading-relaxed transition-shadow duration-300 motion-reduce:transition-none ${
                    l.who === "caller"
                      ? "bg-white/10 self-start"
                      : "bg-accent-btn text-on-accent self-end"
                  } ${i === activeLine ? "ring-2 ring-white/40" : ""}`}
                >
                  <span className="mb-0.5 block text-[0.65rem] font-semibold tracking-[0.14em] uppercase opacity-80">
                    {l.who === "caller" ? "Caller" : "Muxaris"}
                  </span>
                  {l.text}
                </li>
              ))}
            </ol>
            {bookingStage && (
              <div
                className={`rounded-inner mt-4 flex items-center gap-4 border px-4 py-3 transition-colors duration-300 motion-reduce:transition-none ${
                  booked
                    ? "border-accent-bright/50 bg-accent-bright/10"
                    : "border-white/10 bg-white/[0.03]"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex size-9 shrink-0 items-center justify-center rounded-full text-lg ${
                    booked ? "bg-accent-btn text-on-accent" : "bg-white/10 text-dark-muted"
                  }`}
                >
                  ✓
                </span>
                <div>
                  <p className="text-sm font-medium">
                    {booked ? "Booked" : "Booking"} · Sunrise Dental Care
                  </p>
                  <p className="text-dark-muted text-sm">{bookingStage.text}</p>
                </div>
              </div>
            )}
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
          <Link href="/#demo" className="mx-btn mx-btn-secondary">
            Book a demo
          </Link>
        </div>
      </div>
    </section>
  );
}
