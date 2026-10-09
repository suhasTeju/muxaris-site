"use client";

import Link from "next/link";
import { Fragment, useCallback, useRef, useState } from "react";
import { ArrowRight, UserPen } from "lucide-react";
import type { Call, CallTurn, Callback } from "@muxaris/shared";
import { Badge, BackLink, Card, badgeFor } from "@/components/ui";
import { formatDateTime, formatTime, languageLabel } from "@/lib/dashboard";
import { AnalysisCard, PURGED_NOTE } from "./AnalysisCard";
import { CallPlayer } from "./CallPlayer";
import { OutcomeEditor } from "./OutcomeEditor";
import { SyncedTranscript } from "./SyncedTranscript";
import { StatusBadge } from "./core/StatusBadge";
import { formatDateLong, formatDur } from "./core/format";

function Dot() {
  return <span aria-hidden className="bg-line-strong size-[3px] shrink-0 rounded-full" />;
}

/**
 * Call detail from AppCallDetail.dc.html. Owns the call row so the player, analysis and outcome
 * editor stay in step after polls and edits.
 */
export function CallDetail({
  initialCall,
  turns,
  callbacks,
  tz,
  patientName,
}: {
  initialCall: Call;
  turns: CallTurn[];
  callbacks: Callback[];
  tz: string;
  /** The linked patient's name, when the call is matched to one. */
  patientName?: string | null;
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

  const test = call.channel === "browser";
  const purged = call.metrics?.["purgedAt"] !== undefined;
  const masked = call.callerPhoneMasked ?? "Unknown caller";
  const who = test ? "Test call" : patientName ? `${patientName} · ${masked}` : masked;
  const status = badgeFor("status", call.status);
  const hasTranscript = !purged && turns.length > 0;
  const meta = [
    <span key="dur" className="font-mono text-[12.5px]">
      {formatDur(call.durationS)}
    </span>,
    <span key="lang">{call.languageDetected ? languageLabel(call.languageDetected) : "–"}</span>,
    <span key="channel">{test ? "Browser" : "Phone"}</span>,
    <span key="who">{who}</span>,
  ];

  return (
    <div className="animate-mx-in flex flex-col gap-[18px]">
      <BackLink href="/app/calls">All calls</BackLink>
      <div className="flex flex-col gap-[10px]">
        <h1 className="m-0 text-[26px] leading-[1.15] font-semibold tracking-[-0.03em]">
          {formatDateLong(call.startedAt, tz)}, {formatTime(call.startedAt, tz)}
        </h1>
        <div className="text-muted flex flex-wrap items-center gap-[8px] text-[13.5px]">
          <StatusBadge kind="outcome" value={call.outcome} size={24} />
          {call.outcomeSource === "staff" ? (
            <span className="bg-chip text-ink-3 inline-flex h-[24px] items-center gap-[6px] rounded-7 px-[9px] text-[12.5px] font-medium">
              <UserPen size={12} aria-hidden />
              Edited by staff
            </span>
          ) : null}
          <Badge tone={status.tone} variant="outline" size={24} className="border-line">
            {status.label}
          </Badge>
          {meta.map((m) => (
            <Fragment key={m.key}>
              <Dot />
              {m}
            </Fragment>
          ))}
        </div>
      </div>

      <div className="grid items-start gap-[14px] lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)]">
        <div className="flex min-w-0 flex-col gap-[14px]">
          {!purged ? (
            <CallPlayer
              callId={call.id}
              recordingStatus={call.recordingStatus}
              durationS={call.durationS}
              audioRef={audioRef}
              onTimeUpdate={setCurrentMs}
              onCall={onCall}
            />
          ) : null}
          <Card aria-labelledby="transcript-h" className="overflow-hidden">
            <div className="border-chip flex items-center justify-between border-b px-[18px] py-[16px]">
              <h2 id="transcript-h" className="m-0 text-[15px] font-semibold">
                Transcript
              </h2>
              {hasTranscript ? (
                <span className="text-muted text-[12.5px]">Click a line to jump to it</span>
              ) : null}
            </div>
            <SyncedTranscript
              turns={purged ? [] : turns}
              emptyNote={purged ? PURGED_NOTE : undefined}
              callStartedAt={call.startedAt}
              recorderT0Ms={call.metrics?.["recorderT0Ms"] ?? 0}
              currentTimeMs={currentMs}
              onSeek={seek}
            />
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-[14px] lg:sticky lg:top-[84px]">
          <AnalysisCard
            call={call}
            callbackCount={callbacks.length}
            callbackReason={callbacks[0]?.reason}
            onCall={onCall}
          />
          <OutcomeEditor call={call} onSaved={onCall} />
          {callbacks.length > 0 ? (
            <Card aria-labelledby="linked-cb-h" className="flex flex-col gap-[10px] p-[18px]">
              <h2 id="linked-cb-h" className="m-0 text-[15px] font-semibold">
                Callbacks from this call
              </h2>
              <ul className="m-0 flex list-none flex-col gap-[10px] p-0">
                {callbacks.map((cb) => (
                  <li
                    key={cb.id}
                    className="border-chip bg-subtle flex flex-col gap-[6px] rounded-12 border p-[12px]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[13px]">{cb.phoneMasked}</span>
                      <StatusBadge kind="cb" value={cb.status} />
                    </div>
                    <span className="text-ink-2 text-[13.5px] leading-[1.5]">{cb.reason}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/app/callbacks"
                className="flex items-center gap-[6px] text-[13.5px] font-medium"
              >
                Open callback queue
                <ArrowRight size={13} aria-hidden />
              </Link>
            </Card>
          ) : null}
          <p className="text-muted m-0 px-[4px] text-[12.5px] leading-[1.5]">
            {test ? "Test call" : "Phone call"}
            {call.endedAt ? ` · ended ${formatDateTime(call.endedAt, tz)}` : " · in progress"}
            {call.outcomeSource === "worker" ? " · outcome set from the call analysis" : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
