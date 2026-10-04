"use client";

import { useEffect, useMemo, useRef } from "react";
import type { CallTurn } from "@muxaris/shared";

interface Row {
  turn: CallTurn;
  offsetMs: number;
}

function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Transcript whose current turn follows the audio player. Each spoken turn is a button that seeks
 * the player to that turn; tool calls are shown as small non-interactive chips between turns.
 * `currentTimeMs` is null until playback has started, so nothing is highlighted before then.
 */
export function SyncedTranscript({
  turns,
  callStartedAt,
  recorderT0Ms = 0,
  currentTimeMs,
  onSeek,
}: {
  turns: CallTurn[];
  callStartedAt: string;
  /** Offset of the recording's start from the call's start (turn times are on the call clock). */
  recorderT0Ms?: number;
  currentTimeMs: number | null;
  onSeek: (ms: number) => void;
}) {
  const rows = useMemo<Row[]>(() => {
    const base = Date.parse(callStartedAt) + recorderT0Ms;
    let prev = 0;
    return [...turns]
      .sort((a, b) => a.seq - b.seq)
      .map((turn) => ({
        turn,
        // Never negative, never going backwards in seq order.
        offsetMs: (prev = Math.max(prev, Date.parse(turn.startedAt) - base || 0)),
      }));
  }, [turns, callStartedAt, recorderT0Ms]);

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
      <p className="text-muted font-display italic">No transcript was recorded for this call.</p>
    );
  }

  return (
    <ol aria-label="Transcript" className="flex flex-col gap-2">
      {rows.map(({ turn, offsetMs }) => {
        if (turn.role === "tool") {
          return (
            <li key={turn.id} data-kind="tool" className="text-muted self-center text-xs">
              <span className="border-line bg-surface inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1">
                Assistant used <code>{turn.toolName}</code>
                {turn.toolStatus ? (
                  <span
                    className={turn.toolStatus === "error" ? "text-danger" : "text-accent-deep"}
                  >
                    {turn.toolStatus === "error" ? "failed" : "done"}
                  </span>
                ) : null}
              </span>
            </li>
          );
        }
        const current = turn.id === currentId;
        const assistant = turn.role === "assistant";
        return (
          <li key={turn.id} className={`flex ${assistant ? "justify-start" : "justify-end"}`}>
            <button
              type="button"
              ref={current ? currentEl : undefined}
              aria-current={current ? "true" : undefined}
              onClick={() => onSeek(offsetMs)}
              className={`max-w-[85%] rounded-2xl px-4 py-2 text-left text-[15px] motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] ${
                assistant ? "bg-accent-soft" : "border-line bg-surface border"
              } ${current ? "ring-accent ring-2" : "hover:brightness-95"}`}
            >
              <span className="text-muted block text-xs">
                {assistant ? "Assistant" : "Caller"} · {clock(offsetMs)}
              </span>
              {turn.text}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
