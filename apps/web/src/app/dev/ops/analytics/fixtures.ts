/**
 * Dev-preview analytics, generated exactly as `AppAnalytics.dc.html` seeds its charts: 90 days of
 * calls from a seeded Park-Miller generator (seed 42), the hour, language and outcome weights, and
 * the six months of minutes. 30 days gives 275 calls, 125 booked, 45%, 1m 27s, as in the render.
 */
import type { CallAnalytics, LanguageCode, MonthlyUsage } from "@muxaris/shared";
import { FIXTURE_TODAY } from "@/components/dev/fixtures";

const HOURW = [
  0, 0, 0, 0, 0, 0, 0.2, 0.6, 1.6, 2.8, 3.4, 3.1, 2.6, 2.2, 2.4, 2.6, 2.9, 3.2, 3.6, 3.3, 2.4, 1.2,
  0.5, 0.1,
];
const LANGW: Array<[LanguageCode, number]> = [
  ["en-IN", 0.34],
  ["kn-IN", 0.27],
  ["hi-IN", 0.18],
  ["ta-IN", 0.11],
  ["te-IN", 0.1],
];
const OUTW: Array<[string, number]> = [
  ["info", 0.22],
  ["rescheduled", 0.08],
  ["cancelled", 0.05],
  ["callback", 0.07],
  ["handoff", 0.04],
  ["abandoned", 0.06],
  ["unknown", 0.02],
];

function addDays(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const weekday = (key: string) => new Date(`${key}T00:00:00Z`).getUTCDay();

interface Day {
  date: string;
  calls: number;
  booked: number;
  sec: number;
}

function series(): Day[] {
  let seed = 42;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: 90 }, (_, i) => {
    const date = addDays(FIXTURE_TODAY, i - 89);
    const calls =
      weekday(date) === 0 ? Math.floor(r() * 3) : 5 + Math.floor(r() * 7) + (i > 60 ? 2 : 0);
    const booked = Math.round(calls * (0.36 + r() * 0.2));
    return { date, calls, booked, sec: calls * (68 + Math.floor(r() * 40)) };
  });
}

/** GET /v1/analytics/calls for the last `days` days ending on the fixture's today. */
export function analyticsFor(days: number): CallAnalytics {
  const s = series().slice(-days);
  const calls = s.reduce((a, d) => a + d.calls, 0);
  const booked = s.reduce((a, d) => a + d.booked, 0);
  const sec = s.reduce((a, d) => a + d.sec, 0);
  const hourTot = HOURW.reduce((a, b) => a + b, 0);
  return {
    from: s[0]!.date,
    to: s[s.length - 1]!.date,
    totalCalls: calls,
    bookedCalls: booked,
    bookingConversion: calls ? booked / calls : 0,
    avgDurationS: calls ? Math.round(sec / calls) : null,
    byOutcome: Object.fromEntries([
      ["booked", booked],
      ...OUTW.map(([o, w]) => [o, Math.round(w * calls)]),
    ]),
    byLanguage: Object.fromEntries(LANGW.map(([c, w]) => [c, Math.round(w * calls)])),
    byHour: HOURW.map((w) => Math.round((w / hourTot) * calls)),
    byDay: s.map(({ date, calls: n, booked: b }) => ({ date, calls: n, booked: b })),
  };
}

/** GET /v1/analytics/usage?months=6: May to October, October being this month's minutes. */
export function monthsFor(currentMinutes: number): MonthlyUsage[] {
  const mv: Array<[string, number]> = [
    ["2026-05", 1240],
    ["2026-06", 1610],
    ["2026-07", 1980],
    ["2026-08", 2240],
    ["2026-09", 2710],
    ["2026-10", currentMinutes],
  ];
  return mv.map(([month, min]) => ({
    month,
    callSeconds: min * 60,
    calls: 0,
    llmInputTokens: 0,
    llmOutputTokens: 0,
  }));
}
