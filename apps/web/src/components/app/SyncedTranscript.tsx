"use client";

import { useEffect, useMemo, useRef } from "react";
import { Check, TriangleAlert } from "lucide-react";
import type { CallTurn } from "@muxaris/shared";
import { cn } from "@/components/ui";
import { formatClock } from "./format";

interface Row {
  turn: CallTurn;
  offsetMs: number;
}

export const NO_TRANSCRIPT = "No transcript was recorded for this call.";

/** Offsets on the recording clock: never negative, never going backwards in seq order. */
function toRows(turns: CallTurn[], callStartedAt: string, recorderT0Ms: number): Row[] {
  const base = Date.parse(callStartedAt) + recorderT0Ms;
  const rows: Row[] = [];
  let prev = 0;
  for (const turn of [...turns].sort((a, b) => a.seq - b.seq)) {
    prev = Math.max(prev, Date.parse(turn.startedAt) - base || 0);
    rows.push({ turn, offsetMs: prev });
  }
  return rows;
}

function ToolChip({ turn }: { turn: CallTurn }) {
  const failed = turn.toolStatus === "error";
  const Icon = failed ? TriangleAlert : Check;
  return (
    <li
      data-kind="tool"
      className={cn(
        "inline-flex h-[28px] items-center gap-[8px] self-center rounded-pill border px-[12px] text-[12.5px]",
        failed ? "border-rose-line bg-rose-soft text-rose" : "border-line bg-subtle text-ink-3",
      )}
    >
      <Icon size={13} className="shrink-0" />
      Assistant used <span className="font-mono text-[12px]">{turn.toolName}</span>
      {turn.toolStatus ? <span className="opacity-80">· {failed ? "failed" : "done"}</span> : null}
    </li>
  );
}

/**
 * Transcript whose current turn follows the audio player (AppCallDetail.dc.html). Each spoken turn
 * is a button that seeks the player to that turn; tool calls are small non-interactive chips
 * between turns. `currentTimeMs` is null until playback has started, so nothing is highlighted
 * before then. Renders the inside of the Transcript card: the empty note, or the turns.
 */
export function SyncedTranscript({
  turns,
  callStartedAt,
  recorderT0Ms = 0,
  currentTimeMs,
  onSeek,
  emptyNote = NO_TRANSCRIPT,
}: {
  turns: CallTurn[];
  callStartedAt: string;
  /** Offset of the recording's start from the call's start (turn times are on the call clock). */
  recorderT0Ms?: number;
  currentTimeMs: number | null;
  onSeek: (ms: number) => void;
  /** Shown instead of the turns when there are none (the purge note, for example). */
  emptyNote?: string;
}) {
  const rows = useMemo(
    () => toRows(turns, callStartedAt, recorderT0Ms),
    [turns, callStartedAt, recorderT0Ms],
  );

  // The current turn is the last spoken turn that has started: offsetMs <= t < next offsetMs.
  let currentId: string | null = null;
  if (currentTimeMs !== null) {
    for (const r of rows) {
      if (r.turn.role !== "tool" && r.offsetMs <= currentTimeMs) currentId = r.turn.id;
    }
  }

  const currentEl = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!currentId) return;
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    currentEl.current?.scrollIntoView?.({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [currentId]);

  if (rows.length === 0) {
    return (
      <>
        <p className="text-muted m-0 px-[18px] py-[28px] text-center text-[14.5px] italic">
          {emptyNote}
        </p>
        <div aria-hidden className="p-[18px]" />
      </>
    );
  }

  return (
    <ol aria-label="Transcript" className="m-0 flex list-none flex-col gap-[12px] p-[18px]">
      {rows.map(({ turn, offsetMs }) => {
        if (turn.role === "tool") return <ToolChip key={turn.id} turn={turn} />;
        const current = turn.id === currentId;
        const caller = turn.role === "user";
        return (
          <li key={turn.id} className={cn("flex max-w-[80%]", caller ? "self-end" : "self-start")}>
            <button
              type="button"
              ref={current ? currentEl : undefined}
              aria-current={current ? "true" : undefined}
              onClick={() => onSeek(offsetMs)}
              className={cn(
                "flex cursor-pointer flex-col gap-[5px] border-0 bg-transparent p-0 text-left",
                caller ? "items-end" : "items-start",
              )}
            >
              <span
                className={cn(
                  "font-mono text-[11px] tracking-[0.05em]",
                  caller ? "text-muted" : "text-teal-ink",
                )}
              >
                {caller ? "Caller" : "Assistant"} · {formatClock(offsetMs / 1000)}
              </span>
              <span
                className={cn(
                  "text-ink border px-[14px] py-[11px] text-[14.5px] leading-[1.5] transition-all duration-200 ease-[ease]",
                  caller
                    ? "rounded-[14px_14px_4px_14px] bg-white"
                    : "rounded-[14px_14px_14px_4px] bg-teal-tint",
                  current
                    ? "border-teal shadow-[0_0_0_3px_rgba(14,154,150,0.15)]"
                    : caller
                      ? "border-line"
                      : "border-teal-line",
                )}
              >
                {turn.text}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
