"use client";

import { useEffect, useState } from "react";
import { PhoneIncoming } from "lucide-react";
import type { Call } from "@muxaris/shared";
import { Card, cn } from "@/components/ui";
import { useCoreApi } from "./core/api";
import { StatusBadge } from "./core/StatusBadge";

export const PURGED_NOTE = "This call's transcript and summary were deleted after 90 days.";

const POLL_MS = 10_000;
const POLL_MAX_MS = 120_000;
const RECENT_MS = 5 * 60_000;

function entityRows(entities: Record<string, unknown> | undefined): Array<[string, string]> {
  return Object.entries(entities ?? {}).flatMap(([k, v]) => {
    if (v === null || v === undefined || v === "") return [];
    const text = typeof v === "object" ? JSON.stringify(v) : String(v);
    return [[k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()), text]];
  });
}

/**
 * Post-call summary card from AppCallDetail.dc.html: sentiment, summary, the callback line and the
 * extracted details. While the worker has not run yet, a recent call is polled for up to 2 min.
 */
export function AnalysisCard({
  call,
  callbackCount,
  callbackReason,
  onCall,
}: {
  call: Call;
  /** Callbacks linked to this call; a requested callback with none means no number was given. */
  callbackCount: number;
  /** Reason on the linked callback, preferred over the analysis's own wording. */
  callbackReason?: string | null;
  onCall: (call: Call) => void;
}) {
  const api = useCoreApi();
  const [mountedAt] = useState(() => Date.now());
  const [gaveUp, setGaveUp] = useState(false);
  const recent = call.endedAt !== null && mountedAt - Date.parse(call.endedAt) < RECENT_MS;
  const purged = call.metrics?.["purgedAt"] !== undefined;
  // The gateway writes metrics.userTurns when the call ends; zero means nobody spoke.
  const noSpeech = call.metrics?.["userTurns"] === 0;
  const pending = call.analysedAt === null && recent && !gaveUp && !noSpeech && !purged;

  useEffect(() => {
    if (!pending) return;
    let ticks = 0;
    let live = true;
    const id = setInterval(() => {
      ticks += 1;
      if (ticks * POLL_MS >= POLL_MAX_MS) {
        clearInterval(id);
        setGaveUp(true);
        return;
      }
      api<{ call: Call }>(`/v1/calls/${encodeURIComponent(call.id)}`)
        .then((r) => {
          if (live) onCall(r.call);
        })
        .catch(() => undefined);
    }, POLL_MS);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [pending, api, call.id, onCall]);

  let text: string;
  if (purged) text = PURGED_NOTE;
  else if (call.summary) text = call.summary;
  else if (noSpeech || (call.analysedAt && call.analysis?.skipped === "no_turns")) {
    // The worker marked this call as having no caller speech: say so rather than guess.
    text = "No caller speech to summarise.";
  } else if (pending) text = "Summary pending";
  else text = "No summary available";
  const real = !purged && !!call.summary;

  const reason = callbackReason || call.analysis?.callbackReason;
  const callbackLine =
    call.analysis?.needsCallback && !purged
      ? callbackCount === 0
        ? "Caller asked for a callback but left no number."
        : reason
          ? `Callback requested: ${reason}`
          : "Callback requested"
      : null;

  const rows = purged ? [] : entityRows(call.analysis?.entities);

  return (
    <Card aria-labelledby="analysis-h" className="flex flex-col gap-[14px] p-[18px]">
      <div className="flex items-center justify-between">
        <h2 id="analysis-h" className="m-0 text-[15px] font-semibold">
          Summary
        </h2>
        {call.sentiment ? <StatusBadge kind="sentiment" value={call.sentiment} /> : null}
      </div>
      <p
        aria-live={pending && !real ? "polite" : undefined}
        className={cn("m-0 text-[14.5px] leading-[1.6]", real ? "text-ink-2" : "text-muted italic")}
      >
        {text}
      </p>
      {callbackLine ? (
        <div className="bg-amber-soft text-amber-deep flex gap-[10px] rounded-10 px-[12px] py-[10px] text-[13.5px] leading-[1.5]">
          <PhoneIncoming size={14} aria-hidden className="mt-[2px] shrink-0" />
          {callbackLine}
        </div>
      ) : null}
      {rows.length > 0 ? (
        <dl className="border-chip m-0 flex flex-col border-t">
          {rows.map(([k, v]) => (
            <div
              key={k}
              className="border-line-soft grid grid-cols-[110px_minmax(0,1fr)] gap-[10px] border-b py-[9px]"
            >
              <dt className="text-muted text-[12.5px]">{k}</dt>
              <dd className="m-0 text-[13.5px] font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </Card>
  );
}
