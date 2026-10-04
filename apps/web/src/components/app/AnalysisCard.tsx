"use client";

import { useEffect, useState } from "react";
import type { Call } from "@muxaris/shared";
import { useApi } from "@/lib/api-client";
import { Badge } from "./Badge";

const POLL_MS = 10_000;
const POLL_MAX_MS = 120_000;
const RECENT_MS = 5 * 60_000;

const SENTIMENT: Record<NonNullable<Call["sentiment"]>, ["good" | "muted" | "bad", string]> = {
  positive: ["good", "Positive"],
  neutral: ["muted", "Neutral"],
  negative: ["bad", "Negative"],
};

function entityRows(entities: Record<string, unknown> | undefined): Array<[string, string]> {
  return Object.entries(entities ?? {}).flatMap(([k, v]) => {
    if (v === null || v === undefined || v === "") return [];
    const text = typeof v === "object" ? JSON.stringify(v) : String(v);
    return [[k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()), text]];
  });
}

/** Post-call summary. While the worker has not run yet, a recent call is polled for up to 2 min. */
export function AnalysisCard({ call, onCall }: { call: Call; onCall: (call: Call) => void }) {
  const api = useApi();
  const [mountedAt] = useState(() => Date.now());
  const [gaveUp, setGaveUp] = useState(false);
  const recent = call.endedAt !== null && mountedAt - Date.parse(call.endedAt) < RECENT_MS;
  const pending = call.analysedAt === null && recent && !gaveUp;

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

  const rows = entityRows(call.analysis?.entities);
  let body: React.ReactNode;
  if (call.summary) {
    body = <p className="text-[15px]">{call.summary}</p>;
  } else if (call.analysedAt && call.analysis?.skipped === "no_turns") {
    // The worker marked this call as having no caller speech: say so rather than guess.
    body = <p className="text-muted">No caller speech to summarise.</p>;
  } else if (pending) {
    body = (
      <p aria-live="polite" className="text-muted">
        Summary pending
      </p>
    );
  } else {
    body = <p className="text-muted">No summary available</p>;
  }

  return (
    <section
      aria-labelledby="analysis-h"
      className="border-line bg-surface rounded-card border p-5"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 id="analysis-h" className="font-display text-lg">
          Summary
        </h2>
        {call.sentiment ? (
          <Badge tone={SENTIMENT[call.sentiment][0]}>{SENTIMENT[call.sentiment][1]}</Badge>
        ) : null}
      </div>
      {body}
      {call.analysis?.needsCallback ? (
        <p className="mt-3 text-sm">
          <span className="font-medium">Callback requested</span>
          {call.analysis.callbackReason ? (
            <span className="text-muted">: {call.analysis.callbackReason}</span>
          ) : null}
        </p>
      ) : null}
      {rows.length > 0 ? (
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}
