"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import type { Call, CallTurn, Callback } from "@muxaris/shared";
import { formatDateTime, formatDuration } from "@/lib/dashboard";
import { Badge, CallStatusBadge, OutcomeBadge } from "./Badge";
import { AnalysisCard, PURGED_NOTE } from "./AnalysisCard";
import { languageLabel } from "./CallList";
import { CallPlayer } from "./CallPlayer";
import { OutcomeEditor } from "./OutcomeEditor";
import { SyncedTranscript } from "./SyncedTranscript";

/** Owns the call row so the player, analysis and outcome editor stay in step after polls and edits. */
export function CallDetail({
  initialCall,
  turns,
  callbacks,
  tz,
}: {
  initialCall: Call;
  turns: CallTurn[];
  callbacks: Callback[];
  tz: string;
}) {
  const [call, setCall] = useState(initialCall);
  const [currentMs, setCurrentMs] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const onCall = useCallback((c: Call) => setCall(c), []);

  function seek(ms: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = ms / 1000;
    setCurrentMs(ms);
    void audio.play()?.catch(() => undefined);
  }

  return (
    <div className="max-w-6xl px-4 py-8 sm:px-8">
      <Link href="/app/calls" className="text-muted text-sm underline-offset-4 hover:underline">
        ← All calls
      </Link>
      <h1 className="font-display mt-2 text-3xl">{formatDateTime(call.startedAt, tz)}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <OutcomeBadge outcome={call.outcome} />
        {call.outcomeSource === "staff" ? <Badge tone="muted">Edited by staff</Badge> : null}
        <CallStatusBadge status={call.status} />
        <span className="text-muted">{formatDuration(call.durationS)}</span>
        <span className="text-muted">{languageLabel(call.languageDetected)}</span>
        <span className="text-muted">
          {call.channel === "browser" ? "Test call" : (call.callerPhoneMasked ?? "Phone call")}
        </span>
      </div>

      {call.recordingStatus !== "none" ? (
        <div className="mt-6">
          <CallPlayer
            callId={call.id}
            recordingStatus={call.recordingStatus}
            audioRef={audioRef}
            onTimeUpdate={setCurrentMs}
            onCall={onCall}
          />
        </div>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-labelledby="transcript-h">
          <h2 id="transcript-h" className="font-display mb-3 text-xl">
            Transcript
          </h2>
          {call.metrics?.["purgedAt"] !== undefined ? (
            <p className="text-muted font-display italic">{PURGED_NOTE}</p>
          ) : (
            <SyncedTranscript
              turns={turns}
              callStartedAt={call.startedAt}
              recorderT0Ms={call.metrics?.["recorderT0Ms"] ?? 0}
              currentTimeMs={currentMs}
              onSeek={seek}
            />
          )}
        </section>
        <div className="flex flex-col gap-6">
          <AnalysisCard call={call} callbackCount={callbacks.length} onCall={onCall} />
          <OutcomeEditor call={call} onSaved={onCall} />
          {callbacks.length > 0 ? (
            <section
              aria-labelledby="linked-cb-h"
              className="border-line bg-surface rounded-card border p-5"
            >
              <h2 id="linked-cb-h" className="font-display mb-3 text-lg">
                Callbacks from this call
              </h2>
              <ul className="flex flex-col gap-3">
                {callbacks.map((cb) => (
                  <li key={cb.id} className="text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tabular-nums">{cb.phoneMasked}</span>
                      <Badge tone={cb.status === "open" ? "warn" : "good"}>
                        {cb.status === "open" ? "Open" : "Done"}
                      </Badge>
                    </div>
                    <p className="text-muted">{cb.reason}</p>
                  </li>
                ))}
              </ul>
              <Link
                href="/app/callbacks"
                className="text-accent-deep mt-3 inline-block text-sm underline-offset-4 hover:underline"
              >
                Open callback queue
              </Link>
            </section>
          ) : null}
        </div>
      </div>

      <p className="text-muted mt-10 text-xs">
        {call.channel === "browser" ? "Test call" : "Phone call"}
        {call.endedAt ? ` · ended ${formatDateTime(call.endedAt, tz)}` : " · in progress"}
        {call.outcomeSource === "worker" ? " · outcome set from the call analysis" : ""}
      </p>
    </div>
  );
}
