import Link from "next/link";
import type { Call } from "@muxaris/shared";
import { LANGUAGES } from "@muxaris/shared";
import { formatDateTime, formatDuration, maskPhone } from "@/lib/dashboard";
import { CallStatusBadge, OutcomeBadge } from "./Badge";

export function languageLabel(code: string | null): string {
  if (!code) return "-";
  return LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

export function CallList({
  calls,
  tz,
  emptyText = "No calls yet. Try your assistant to place a first test call.",
}: {
  calls: Call[];
  tz: string;
  emptyText?: string;
}) {
  if (calls.length === 0) {
    return <p className="text-muted font-display py-6 italic">{emptyText}</p>;
  }
  return (
    <ul className="border-line bg-surface divide-line divide-y rounded-2xl border">
      {calls.map((c) => (
        <li key={c.id}>
          <Link
            href={`/app/calls/${c.id}`}
            className="hover:bg-paper flex min-h-14 flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 first:rounded-t-2xl last:rounded-b-2xl focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          >
            <span className="min-w-36 flex-1 text-[15px]">
              {formatDateTime(c.startedAt, tz)}
              <span className="text-muted block text-xs">
                {c.channel === "browser"
                  ? "Test call"
                  : c.callerPhone
                    ? maskPhone(c.callerPhone)
                    : "Phone"}
              </span>
            </span>
            <span className="text-muted w-16 text-sm tabular-nums">
              {formatDuration(c.durationS)}
            </span>
            <span className="text-muted w-20 text-sm">{languageLabel(c.languageDetected)}</span>
            <OutcomeBadge outcome={c.outcome} />
            <CallStatusBadge status={c.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
