import Link from "next/link";
import type { CallAnalytics, MonthlyUsage } from "@muxaris/shared";
import { OUTCOME_LABEL, formatDuration, languageLabel, type Section } from "@/lib/dashboard";
import { BarChart } from "@/components/charts/BarChart";
import { KpiCard } from "./KpiCard";

export const RANGES = [7, 30, 90] as const;
export type RangeDays = (typeof RANGES)[number];

function Unavailable({ what }: { what: string }) {
  return (
    <p role="alert" className="text-danger py-4 text-sm">
      Couldn&apos;t load {what}. Refresh the page to try again.
    </p>
  );
}

const DASH = "–";
const HOURS = Array.from({ length: 24 }, (_, h) => String(h));

function outcomeLabel(key: string): string {
  return Object.hasOwn(OUTCOME_LABEL, key) ? OUTCOME_LABEL[key as keyof typeof OUTCOME_LABEL] : key;
}

export function AnalyticsView({
  analytics,
  months,
  days,
}: {
  analytics: Section<CallAnalytics>;
  months: Section<MonthlyUsage[]>;
  days: RangeDays;
  tz: string;
}) {
  const a = analytics.ok ? analytics.data : undefined;
  const languages = a ? Object.entries(a.byLanguage) : [];
  const outcomes = a ? Object.entries(a.byOutcome) : [];
  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-3xl">Analytics</h1>
        <nav aria-label="Date range" className="flex gap-3 text-sm">
          {RANGES.map((d) => (
            <Link
              key={d}
              href={`/app/analytics?days=${d}`}
              aria-current={d === days ? "page" : undefined}
              className={
                d === days
                  ? "text-ink font-medium underline underline-offset-4"
                  : "text-accent-deep underline-offset-4 hover:underline"
              }
            >
              {d} days
            </Link>
          ))}
        </nav>
      </div>

      <section aria-label="Key numbers" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Calls" value={a ? String(a.totalCalls) : DASH} />
        <KpiCard label="Booked" value={a ? String(a.bookedCalls) : DASH} />
        <KpiCard
          label="Booking rate"
          value={a ? `${Math.round(a.bookingConversion * 100)}%` : DASH}
        />
        <KpiCard label="Average call" value={a ? formatDuration(a.avgDurationS) : DASH} />
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {a ? (
          <>
            <BarChart
              title="Calls per day"
              categories={a.byDay.map((d) => d.date.slice(5))}
              series={[
                { name: "Calls", values: a.byDay.map((d) => d.calls) },
                { name: "Booked", values: a.byDay.map((d) => d.booked) },
              ]}
            />
            <BarChart
              title="Calls by hour"
              categories={HOURS}
              series={[{ name: "Calls", values: a.byHour }]}
            />
            <BarChart
              title="Calls by language"
              categories={languages.map(([code]) => languageLabel(code))}
              series={[{ name: "Calls", values: languages.map(([, n]) => n) }]}
            />
            <BarChart
              title="Calls by outcome"
              categories={outcomes.map(([k]) => outcomeLabel(k))}
              series={[{ name: "Calls", values: outcomes.map(([, n]) => n) }]}
            />
          </>
        ) : (
          <div className="lg:col-span-2">
            <Unavailable what="call analytics" />
          </div>
        )}
        {months.ok ? (
          <BarChart
            title="Minutes per month"
            categories={months.data.map((m) => m.month)}
            series={[
              { name: "Minutes", values: months.data.map((m) => Math.ceil(m.callSeconds / 60)) },
            ]}
          />
        ) : (
          <Unavailable what="monthly usage" />
        )}
      </div>
    </div>
  );
}
