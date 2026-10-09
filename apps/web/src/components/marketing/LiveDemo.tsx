"use client";

import { CalendarCheck, CalendarClock, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button, buttonClass } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { DEMO_LOOP_END, DEMO_STAGES, SAMPLE_CALL_DURATION, TRANSCRIPT } from "@/lib/content";
import { Mark } from "./Mark";
import { ANCHOR, CONTAINER, SECTION_X, SECTION_Y, SectionHeader } from "./SectionHeader";
import { SiteLink } from "./SiteLink";
import { TryLive } from "./TryLive";

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

const TICK_MS = 100;
const BOOKED_AT = DEMO_STAGES[1].at;

/** "0:04" from 4.3 s. */
function stamp(at: number) {
  const s = Math.floor(at);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

type Mode = "silent" | "playing" | "paused";

/**
 * The scripted sample call. While the clip plays the clock follows the audio; otherwise, once
 * the section is in view, the same script replays silently and loops. Reduced motion shows the
 * finished call and never animates.
 */
export function LiveDemo({
  signedIn,
  initialTime = 0,
  loop = true,
}: {
  /** Overrides the session-cookie check for "Try it live" (dev previews). */
  signedIn?: boolean;
  /** Where the script starts, in seconds. */
  initialTime?: number;
  /** Replay the script silently while in view. */
  loop?: boolean;
}) {
  const root = useRef<HTMLElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const [t, setT] = useState(initialTime);
  const [mode, setMode] = useState<Mode>("silent");
  const [visible, setVisible] = useState(false);
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

  const ticking = mode === "playing" || (mode === "silent" && visible && loop && !reduced);
  useEffect(() => {
    if (!ticking) return;
    const id = window.setInterval(() => {
      const a = audio.current;
      if (a && !a.paused) {
        setT(a.currentTime);
      } else {
        setT((prev) => (prev + TICK_MS / 1000 > DEMO_LOOP_END ? 0 : prev + TICK_MS / 1000));
      }
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [ticking]);

  // Reduced motion: the finished call, unless the clip is playing (then the bar follows it).
  const shown = reduced ? SAMPLE_CALL_DURATION : t;
  const progress = Math.min(
    100,
    ((reduced && mode !== "silent" ? t : shown) / SAMPLE_CALL_DURATION) * 100,
  );
  const booked = shown >= BOOKED_AT;
  const lastStage = DEMO_STAGES.reduce((acc, s, i) => (shown >= s.at ? i : acc), 0);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (mode === "playing") {
      a.pause();
      return;
    }
    if (mode === "silent") {
      a.currentTime = 0;
      setT(0);
    }
    setMode("playing");
    void a.play().catch(() => setMode("silent"));
  };

  return (
    <section
      id="live-demo"
      ref={root}
      className={cn(
        "border-line relative overflow-hidden border-t bg-[linear-gradient(180deg,#e9eff3_0%,#f4f6f9_100%)]",
        SECTION_X,
        SECTION_Y,
        ANCHOR,
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(50% 60% at 78% 10%,rgba(14,154,150,0.14),transparent 70%),radial-gradient(40% 50% at 0% 100%,rgba(94,224,214,0.12),transparent 70%)",
        }}
      />
      <div
        className={`${CONTAINER} relative grid items-start gap-[48px] lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-[72px]`}
      >
        <div className="flex flex-col gap-[36px]">
          <SectionHeader eyebrow="Live demo" aside="Twenty seconds.">
            One call, start to finish.
          </SectionHeader>
          <ol className="m-0 flex list-none flex-col gap-[10px] p-0">
            {DEMO_STAGES.map((s, i) => {
              const on = shown >= s.at;
              return (
                <li
                  key={s.id}
                  aria-current={i === lastStage ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-[16px] rounded-[16px] border px-[18px] py-[16px] transition-all duration-300 motion-reduce:transition-none",
                    on
                      ? "border-teal-hover bg-[rgba(255,255,255,0.92)]"
                      : "border-line bg-[rgba(255,255,255,0.35)]",
                  )}
                >
                  <span
                    className={cn(
                      "rounded-10 grid size-[32px] flex-none place-items-center font-mono text-[12px] transition-all duration-300 motion-reduce:transition-none",
                      on ? "bg-teal text-white" : "bg-chip text-muted",
                    )}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="flex flex-col gap-[2px]">
                    <span
                      className={cn("text-[16px] font-semibold", on ? "text-ink" : "text-muted")}
                    >
                      {s.title}
                    </span>
                    <span className="text-muted text-[14px]">{s.text}</span>
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="flex flex-wrap items-center gap-[12px]">
            <SiteLink href="/#demo" className={buttonClass({ size: 52, className: "shadow-cta" })}>
              Book a demo
            </SiteLink>
            <TryLive signedIn={signedIn} />
          </div>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-white bg-[rgba(255,255,255,0.8)] shadow-[0_1px_2px_rgba(12,18,32,0.04),0_40px_80px_-40px_rgba(12,18,32,0.32)] backdrop-blur-[20px]">
          <div className="border-line flex items-center justify-between gap-[16px] border-b px-[22px] py-[20px]">
            <div className="flex items-center gap-[12px]">
              <Mark size={36} />
              <div className="flex flex-col">
                <span className="text-[15px] font-semibold">Sunrise Dental Care</span>
                <span className="text-muted font-mono text-[12px]">Sample call · English</span>
              </div>
            </div>
            <Button
              size={40}
              icon={mode === "playing" ? Pause : Play}
              iconSize={14}
              onClick={toggle}
              className="rounded-12 pr-[16px] pl-[12px] shadow-none"
            >
              {mode === "playing" ? "Pause audio" : "Play audio"}
            </Button>
          </div>
          <div aria-hidden="true" className="bg-line h-[2px]">
            <div
              className="bg-teal h-[2px] transition-[width] duration-100 ease-linear motion-reduce:transition-none"
              style={{ width: `${progress.toFixed(1)}%` }}
            />
          </div>
          <ol
            aria-label="Call transcript"
            className="m-0 flex min-h-[420px] list-none flex-col gap-[14px] px-[22px] py-[24px]"
          >
            {TRANSCRIPT.filter((l) => shown >= l.at).map((l) => {
              const caller = l.who === "caller";
              return (
                <li
                  key={l.at}
                  className={cn(
                    "flex max-w-[78%] animate-[mxIn8_.4s_ease_both] flex-col gap-[6px] motion-reduce:animate-none",
                    caller ? "items-end self-end" : "self-start",
                  )}
                >
                  <span
                    className={cn(
                      "font-mono text-[11px] tracking-[0.06em] uppercase",
                      caller ? "text-muted" : "text-teal-ink",
                    )}
                  >
                    {caller ? "Caller" : "Muxaris"} · {stamp(l.at)}
                  </span>
                  <p
                    className={cn(
                      "m-0 px-[16px] py-[12px] text-[15px] leading-[1.5]",
                      caller
                        ? "bg-chip rounded-[16px_16px_4px_16px]"
                        : "border-teal-line bg-teal-soft rounded-[16px_16px_16px_4px] border",
                    )}
                  >
                    {l.text}
                  </p>
                </li>
              );
            })}
          </ol>
          <div
            className={cn(
              "mx-[22px] mb-[22px] flex items-center gap-[14px] rounded-[16px] border px-[16px] py-[14px] transition-all duration-[400ms] motion-reduce:transition-none",
              booked ? "border-[#bfe5cb] bg-[#f0faf3]" : "border-line bg-subtle",
            )}
          >
            <span
              className={cn(
                "rounded-11 grid size-[36px] flex-none place-items-center transition-all duration-[400ms] motion-reduce:transition-none",
                booked ? "bg-green-soft text-green-ink" : "bg-chip text-muted",
              )}
            >
              {booked ? (
                <CalendarCheck size={18} aria-hidden />
              ) : (
                <CalendarClock size={18} aria-hidden />
              )}
            </span>
            <div className="flex flex-col gap-[2px]">
              <span
                className={cn(
                  "font-mono text-[11px] tracking-[0.08em] uppercase",
                  booked ? "text-green-ink" : "text-muted",
                )}
              >
                {booked ? "Booked" : "Booking"} · Sunrise Dental Care
              </span>
              <span className="text-[15px] font-semibold">{DEMO_STAGES[1].text}</span>
            </div>
          </div>
          <audio
            ref={audio}
            src="/audio/sample-call.m4a"
            preload="none"
            onPlay={() => setMode("playing")}
            onPause={() => setMode("paused")}
            onEnded={() => setMode("silent")}
          />
        </div>
      </div>
    </section>
  );
}
