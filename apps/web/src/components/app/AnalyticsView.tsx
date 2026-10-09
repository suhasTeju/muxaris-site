import { LANGUAGES, type CallAnalytics, type MonthlyUsage } from "@muxaris/shared";
import { formatDuration, languageLabel, type Section } from "@/lib/dashboard";
import { BarChart } from "@/components/charts/BarChart";
import { BarList, type BarListItem } from "@/components/charts/BarList";
import { MonthBars } from "@/components/charts/MonthBars";
import {
  BADGES,
  Card,
  KpiCard,
  Notice,
  PageHeader,
  Segmented,
  TONES,
  badgeFor,
} from "@/components/ui";

export const RANGES = [7, 30, 90] as const;
export type RangeDays = (typeof RANGES)[number];

const DASH = "–";
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** The design's outcome order: booked first, then the rest as the prototype lists them. */
const OUTCOMES = [
  "booked",
  "info",
  "rescheduled",
  "cancelled",
  "callback",
  "handoff",
  "abandoned",
  "unknown",
];

/** "YYYY-MM-DD" → parts, read as a calendar date (no timezone shift). */
function cal(key: string) {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  return { y, m, d, wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}
/** "Thu, 10 Sep 2026" */
const dateLong = (key: string) => {
  const c = cal(key);
  return `${WD[c.wd]}, ${c.d} ${MON[c.m - 1]} ${c.y}`;
};
/** "Thu, 10 Sep" */
const dateMid = (key: string) => {
  const c = cal(key);
  return `${WD[c.wd]}, ${c.d} ${MON[c.m - 1]}`;
};
/** "10 Sep" */
const dayShort = (key: string) => {
  const c = cal(key);
  return `${c.d} ${MON[c.m - 1]}`;
};
const monthShort = (month: string) => MON[Number(month.slice(5, 7)) - 1] ?? month;
const num = (n: number) => n.toLocaleString("en-IN");

function ChartCard({
  title,
  label,
  legend,
  children,
}: {
  title: string;
  label?: string;
  legend?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card aria-label={label ?? title} className="flex min-w-0 flex-col gap-[14px] p-[18px]">
      {legend ? (
        <div className="flex items-center justify-between gap-[12px]">
          <h2 className="m-0 text-[15px] font-semibold">{title}</h2>
          {legend}
        </div>
      ) : (
        <h2 className="m-0 text-[15px] font-semibold">{title}</h2>
      )}
      {children}
    </Card>
  );
}

function Swatch({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-[6px]">
      <span className="size-[10px] rounded-[3px]" style={{ background: color }} />
      {children}
    </span>
  );
}

function Unavailable({ what }: { what: string }) {
  return <Notice tone="bad">Couldn&apos;t load {what}. Refresh the page to try again.</Notice>;
}

function languageItems(byLanguage: Record<string, number>): BarListItem[] {
  const codes = [
    ...LANGUAGES.map((l) => l.code as string),
    ...Object.keys(byLanguage).filter((k) => !LANGUAGES.some((l) => l.code === k)),
  ];
  return codes
    .map((code, order) => ({ code, order, n: byLanguage[code] ?? 0 }))
    .sort((a, b) => b.n - a.n || a.order - b.order)
    .map(({ code, n }) => {
      const lang = LANGUAGES.find((l) => l.code === code);
      const label = lang?.label ?? (code === "unknown" ? "Unknown" : languageLabel(code));
      return {
        key: code,
        text: label,
        value: n,
        color: "var(--color-teal)",
        label: (
          <span className="flex flex-col leading-[1.2]">
            <span className="text-[13.5px] font-medium">{label}</span>
            {lang ? <span className="text-muted text-[12px]">{lang.native}</span> : null}
          </span>
        ),
      };
    });
}

function outcomeItems(byOutcome: Record<string, number>): BarListItem[] {
  const keys = [...OUTCOMES, ...Object.keys(byOutcome).filter((k) => !OUTCOMES.includes(k))];
  return keys.map((k) => {
    const b = Object.hasOwn(BADGES.outcome, k)
      ? badgeFor("outcome", k)
      : { label: k, tone: "muted" as const };
    const dot = TONES[b.tone].dot;
    return {
      key: k,
      text: b.label,
      value: byOutcome[k] ?? 0,
      color: dot,
      label: (
        <span className="flex items-center gap-[8px] text-[13.5px]">
          <span className="size-[7px] rounded-full" style={{ background: dot }} />
          {b.label}
        </span>
      ),
    };
  });
}

export function AnalyticsView({
  analytics,
  months,
  days,
  from,
  to,
  includedMinutes,
}: {
  analytics: Section<CallAnalytics>;
  months: Section<MonthlyUsage[]>;
  days: RangeDays;
  /** First and last day of the range ("YYYY-MM-DD", clinic-local); falls back to the analytics. */
  from?: string;
  to?: string;
  /** The plan's included minutes, for the dashed line on "Minutes per month". */
  includedMinutes?: number;
  tz: string;
}) {
  const a = analytics.ok ? analytics.data : undefined;
  const start = from ?? a?.from;
  const end = to ?? a?.to;
  const byDay = a?.byDay ?? [];
  const n = byDay.length;
  const tickIdx = n
    ? [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4), n - 1]
    : [];
  const maxHour = a ? Math.max(0, ...a.byHour) : 0;

  return (
    <div className="animate-mx-in flex flex-col gap-[18px]">
      <PageHeader
        title="Analytics"
        subtitle={start && end ? `${dateLong(start)} – ${dateLong(end)}` : undefined}
        actions={
          <Segmented
            aria-label="Range"
            value={String(days)}
            items={RANGES.map((d) => ({
              id: String(d),
              label: `${d} days`,
              href: `/app/analytics?days=${d}`,
            }))}
          />
        }
      />

      <section
        aria-label="Key numbers"
        className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-[14px]"
      >
        <KpiCard label="Calls" value={a ? num(a.totalCalls) : DASH} />
        <KpiCard label="Booked" value={a ? num(a.bookedCalls) : DASH} />
        <KpiCard
          label="Booking rate"
          value={a ? `${Math.round(a.bookingConversion * 100)}%` : DASH}
        />
        <KpiCard
          label="Average call"
          value={a && a.avgDurationS != null ? formatDuration(a.avgDurationS) : DASH}
        />
      </section>

      {a ? (
        <>
          <ChartCard
            title="Calls per day"
            label={`Calls per day, ${a.totalCalls} calls and ${a.bookedCalls} booked`}
            legend={
              <div className="text-muted flex gap-[14px] text-[12.5px]">
                <Swatch color="#c9e9e6">Calls</Swatch>
                <Swatch color="var(--color-teal)">Booked</Swatch>
              </div>
            }
          >
            <BarChart
              title="Calls per day"
              summary={`Calls per day, ${a.totalCalls} calls and ${a.bookedCalls} booked`}
              categories={byDay.map((d) => dateMid(d.date))}
              series={{ name: "Calls", values: byDay.map((d) => d.calls) }}
              overlay={{ name: "Booked", values: byDay.map((d) => d.booked) }}
              height={200}
              gap={n > 30 ? 2 : n > 7 ? 4 : 10}
              gridStep={50}
              className="pt-[8px]"
              ticks={tickIdx.map((i) => dayShort(byDay[i]!.date))}
              barClassName={() => "bg-[#c9e9e6] hover:bg-[#a8dcd7]"}
              barTitle={(i) =>
                `${dateMid(byDay[i]!.date)}: ${byDay[i]!.calls} calls, ${byDay[i]!.booked} booked`
              }
            />
          </ChartCard>

          <div className="grid gap-[14px] lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <ChartCard title="Calls by hour">
              <BarChart
                title="Calls by hour"
                categories={a.byHour.map((_, h) => `${h}:00`)}
                series={{ name: "Calls", values: a.byHour }}
                height={160}
                gap={4}
                gridStep={40}
                ticks={["0", "6", "12", "18", "23"]}
                barClassName={(v) =>
                  v === maxHour && v > 0
                    ? "bg-teal hover:bg-[#0b7f7c]"
                    : "bg-[#7fcfc9] hover:bg-[#0b7f7c]"
                }
                barTitle={(h) => `${h}:00 – ${a.byHour[h]} calls`}
              />
            </ChartCard>
            <ChartCard title="Calls by language">
              <BarList
                title="Calls by language"
                items={languageItems(a.byLanguage)}
                labelWidth={92}
                rowGap={12}
              />
            </ChartCard>
          </div>
        </>
      ) : (
        <Unavailable what="call analytics" />
      )}

      <div
        className={
          a ? "grid gap-[14px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]" : "grid gap-[14px]"
        }
      >
        {a ? (
          <ChartCard title="Calls by outcome">
            <BarList
              title="Calls by outcome"
              items={outcomeItems(a.byOutcome)}
              labelWidth={96}
              rowGap={10}
            />
          </ChartCard>
        ) : null}
        <ChartCard
          title="Minutes per month"
          legend={
            months.ok && includedMinutes !== undefined ? (
              <span className="text-muted flex items-center gap-[6px] text-[12.5px]">
                <span className="border-muted-2 w-[14px] border-t-[1.5px] border-dashed" />
                {num(includedMinutes)} min included
              </span>
            ) : undefined
          }
        >
          {months.ok ? (
            <MonthBars
              title="Minutes per month"
              months={months.data.map((m) => ({
                label: monthShort(m.month),
                value: Math.ceil(m.callSeconds / 60),
              }))}
              included={includedMinutes}
            />
          ) : (
            <Unavailable what="monthly usage" />
          )}
        </ChartCard>
      </div>
    </div>
  );
}
