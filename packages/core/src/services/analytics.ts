import { and, eq, gte, lt, sql } from "drizzle-orm";
import { schema, type Db } from "@muxaris/db";
import { assertDateString } from "../scheduling/time.js";
import { usageMonth } from "./usage.js";
import { CoreError } from "./errors.js";

const { calls, usageLedger } = schema;

export interface CallAnalytics {
  from: string;
  to: string;
  totalCalls: number;
  bookedCalls: number;
  bookingConversion: number;
  avgDurationS: number | null;
  byOutcome: Record<string, number>;
  byLanguage: Record<string, number>;
  byHour: number[];
  byDay: Array<{ date: string; calls: number; booked: number }>;
}

export interface MonthlyUsage {
  month: string;
  callSeconds: number;
  calls: number;
  llmInputTokens: number;
  llmOutputTokens: number;
}

function zoneOffset(date: string, timeZone: string): string {
  const probe = new Date(`${date}T12:00:00Z`);
  const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(probe)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = part?.match(/^GMT(?:([+-]\d{2}):?(\d{2})?)?$/);
  if (!m) return "Z";
  return m[1] ? `${m[1]}:${m[2] ?? "00"}` : "Z";
}
function startOfLocalDay(date: string, timeZone: string): Date {
  return new Date(`${date}T00:00:00${zoneOffset(date, timeZone)}`);
}
function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const MAX_RANGE_DAYS = 92;

export function localDayWindow(from: string, to: string, timeZone: string) {
  assertDateString(from);
  assertDateString(to);
  if (to < from) throw new CoreError("validation", "`to` must not be before `from`");
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
  if (days > MAX_RANGE_DAYS)
    throw new CoreError("validation", `range exceeds ${MAX_RANGE_DAYS} days`);
  return {
    start: startOfLocalDay(from, timeZone),
    end: startOfLocalDay(addDays(to, 1), timeZone),
    days,
  };
}

export async function getCallAnalytics(
  db: Db,
  clinicId: string,
  range: { from: string; to: string; timezone: string },
): Promise<CallAnalytics> {
  const { start, end, days } = localDayWindow(range.from, range.to, range.timezone);
  const inWindow = and(
    eq(calls.clinicId, clinicId),
    gte(calls.startedAt, start),
    lt(calls.startedAt, end),
  );
  const tz = range.timezone;
  const [agg] = await db
    .select({
      n: sql<number>`count(*)::int`,
      booked: sql<number>`count(*) FILTER (WHERE ${calls.outcome} = 'booked')::int`,
      avg: sql<string | null>`avg(${calls.durationS}) FILTER (WHERE ${calls.endedAt} IS NOT NULL)`,
    })
    .from(calls)
    .where(inWindow);
  const outcomes = await db
    .select({ k: calls.outcome, n: sql<number>`count(*)::int` })
    .from(calls)
    .where(and(inWindow, sql`${calls.outcome} IS NOT NULL`))
    .groupBy(calls.outcome);
  const languages = await db
    .select({
      k: sql<string>`coalesce(${calls.languageDetected}, 'unknown')`,
      n: sql<number>`count(*)::int`,
    })
    .from(calls)
    .where(inWindow)
    .groupBy(sql`coalesce(${calls.languageDetected}, 'unknown')`);
  const hours = await db
    .select({
      h: sql<number>`extract(hour from (${calls.startedAt} AT TIME ZONE ${tz}))::int`,
      n: sql<number>`count(*)::int`,
    })
    .from(calls)
    .where(inWindow)
    .groupBy(sql`1`);
  const perDay = await db
    .select({
      d: sql<string>`to_char(${calls.startedAt} AT TIME ZONE ${tz}, 'YYYY-MM-DD')`,
      n: sql<number>`count(*)::int`,
      booked: sql<number>`count(*) FILTER (WHERE ${calls.outcome} = 'booked')::int`,
    })
    .from(calls)
    .where(inWindow)
    .groupBy(sql`1`);

  const byOutcome: Record<string, number> = {};
  for (const o of outcomes) if (o.k) byOutcome[o.k] = o.n;
  const byLanguage: Record<string, number> = {};
  for (const l of languages) byLanguage[l.k] = l.n;
  const byHour = new Array<number>(24).fill(0);
  for (const h of hours) if (h.h >= 0 && h.h < 24) byHour[h.h] = h.n;
  const dayMap = new Map(perDay.map((d) => [d.d, d]));
  const byDay: CallAnalytics["byDay"] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(range.from, i);
    const d = dayMap.get(date);
    byDay.push({ date, calls: d?.n ?? 0, booked: d?.booked ?? 0 });
  }
  const totalCalls = agg?.n ?? 0;
  const bookedCalls = agg?.booked ?? 0;
  return {
    from: range.from,
    to: range.to,
    totalCalls,
    bookedCalls,
    bookingConversion: totalCalls ? bookedCalls / totalCalls : 0,
    avgDurationS: agg?.avg == null ? null : Math.round(Number(agg.avg)),
    byOutcome,
    byLanguage,
    byHour,
    byDay,
  };
}

export async function getMonthlyUsage(
  db: Db,
  clinicId: string,
  months: number,
  at: Date = new Date(),
  timezone = "Asia/Kolkata",
): Promise<MonthlyUsage[]> {
  if (months < 1) return [];
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(at);
    d.setUTCDate(1);
    d.setUTCHours(12, 0, 0, 0);
    d.setUTCMonth(d.getUTCMonth() - i);
    keys.push(usageMonth(timezone, d));
  }
  const rows = await db
    .select()
    .from(usageLedger)
    .where(and(eq(usageLedger.clinicId, clinicId), sql`${usageLedger.month} >= ${keys[0]!}`));
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  return keys.map((month) => {
    const r = byMonth.get(month);
    return {
      month,
      callSeconds: r?.callSeconds ?? 0,
      calls: r?.calls ?? 0,
      llmInputTokens: r?.llmInputTokens ?? 0,
      llmOutputTokens: r?.llmOutputTokens ?? 0,
    };
  });
}
