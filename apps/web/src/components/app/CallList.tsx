import { Fragment } from "react";
import { ChevronRight } from "lucide-react";
import type { Call } from "@muxaris/shared";
import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  TableGroup,
  TableHead,
  TableRow,
  badgeFor,
} from "@/components/ui";
import { addDays, formatTime, languageLabel, localDateKey } from "@/lib/dashboard";
import { callIcon, callerOf, type PatientNames } from "./core/calls";
import { formatDur, keyDateLong } from "./core/format";
import { CALLS_TABLE_MIN_W } from "./core/layout";

const COLUMNS = "170px minmax(0,1fr) 90px 100px 130px 120px 20px";

/** Calls grouped by local day ("Today · Fri, 9 Oct 2026"), newest first as the API returns them. */
function byDay(calls: Call[], tz: string, todayKey: string) {
  const yesterday = addDays(todayKey, -1);
  const groups: Array<{ key: string; label: string; calls: Call[] }> = [];
  for (const c of calls) {
    const key = localDateKey(c.startedAt, tz);
    let g = groups.find((x) => x.key === key);
    if (!g) {
      const long = keyDateLong(key);
      const label =
        key === todayKey ? `Today · ${long}` : key === yesterday ? `Yesterday · ${long}` : long;
      g = { key, label, calls: [] };
      groups.push(g);
    }
    g.calls.push(c);
  }
  return groups.sort((a, b) => b.key.localeCompare(a.key));
}

/** The Calls table from AppCalls.dc.html: day groups, caller tile, mono times, outcome and status. */
export function CallList({
  calls,
  tz,
  now = new Date(),
  names,
  filtered = false,
}: {
  calls: Call[];
  tz: string;
  /** Anchors the "Today" and "Yesterday" group labels. */
  now?: Date;
  names?: PatientNames;
  /** A filter is active: an empty list means "no matches", not "no calls yet". */
  filtered?: boolean;
}) {
  if (calls.length === 0 && filtered) {
    return <EmptyState>No calls match these filters.</EmptyState>;
  }
  if (calls.length === 0) {
    return (
      <EmptyState action={<ButtonLink href="/app/assistant/try">Place a test call</ButtonLink>}>
        No calls yet. Try your assistant to place a first test call.
      </EmptyState>
    );
  }
  return (
    <Card className="overflow-hidden" aria-label="Calls">
      {/* Below the table's natural width it scrolls inside the card, not the page. */}
      <div className="overflow-x-auto">
        <div className={CALLS_TABLE_MIN_W}>
          <TableHead columns={COLUMNS}>
            <span>When</span>
            <span>Caller</span>
            <span>Duration</span>
            <span>Language</span>
            <span>Outcome</span>
            <span>Status</span>
            <span />
          </TableHead>
          {byDay(calls, tz, localDateKey(now, tz)).map((g) => (
            <Fragment key={g.key}>
              <TableGroup>{g.label}</TableGroup>
              {g.calls.map((c) => {
                const who = callerOf(c, names);
                const { icon: Icon, tile } = callIcon(c);
                const ob = badgeFor("outcome", c.outcome);
                const sb = badgeFor("status", c.status);
                return (
                  <TableRow key={c.id} columns={COLUMNS} href={`/app/calls/${c.id}`}>
                    <span className="text-ink-2 font-mono text-[12.5px]">
                      {formatTime(c.startedAt, tz)}
                    </span>
                    <span className="flex min-w-0 items-center gap-[10px]">
                      <span
                        className={`grid size-[28px] shrink-0 place-items-center rounded-8 ${tile}`}
                      >
                        <Icon size={14} aria-hidden="true" />
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">{who.who}</span>
                        {who.sub ? (
                          <span className="text-muted truncate font-mono text-[11.5px]">
                            {who.sub}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span className="text-ink-2 font-mono text-[12.5px]">
                      {formatDur(c.durationS)}
                    </span>
                    <span className="text-ink-2">
                      {c.languageDetected ? languageLabel(c.languageDetected) : "–"}
                    </span>
                    <span>
                      <Badge tone={ob.tone}>{ob.label}</Badge>
                    </span>
                    <span>
                      <Badge
                        variant="outline"
                        tone={sb.tone}
                        className={c.status === "completed" ? "border-line" : undefined}
                      >
                        {sb.label}
                      </Badge>
                    </span>
                    <ChevronRight size={14} className="text-muted-2" aria-hidden="true" />
                  </TableRow>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </Card>
  );
}
