import { EmptyState } from "./EmptyState";
import Link from "next/link";
import type { Call } from "@muxaris/shared";
import { LANGUAGES } from "@muxaris/shared";
import { formatDateTime, formatDuration } from "@/lib/dashboard";
import { CallStatusBadge, OutcomeBadge } from "./Badge";

export function languageLabel(code: string | null): string {
  if (!code) return "-";
  return LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

export function CallList({
  calls,
  tz,
  emptyText = "No calls yet. Try your assistant to place a first test call.",
  filtered = false,
}: {
  calls: Call[];
  tz: string;
  emptyText?: string;
  /** A filter is active: an empty list means "no matches", not "no calls yet". */
  filtered?: boolean;
}) {
  if (calls.length === 0 && filtered) {
    return <EmptyState>No calls match these filters.</EmptyState>;
  }
  if (calls.length === 0) {
    return (
      <EmptyState action={{ href: "/app/assistant/try", label: "Place a test call" }}>
        {emptyText}
      </EmptyState>
    );
  }
  return (
    <ul className="border-line bg-surface divide-line divide-y rounded-card border">
      {calls.map((c) => (
        <li key={c.id}>
          <Link
            href={`/app/calls/${c.id}`}
            className="hover:bg-paper flex min-h-14 flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 first:rounded-t-card last:rounded-b-card focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          >
            <span className="min-w-36 flex-1 text-[15px]">
              {formatDateTime(c.startedAt, tz)}
              <span className="text-muted block text-xs">
                {c.channel === "browser" ? "Test call" : (c.callerPhoneMasked ?? "Phone")}
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
