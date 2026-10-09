import { DevAppFrame } from "@/components/dev/DevAppFrame";
import { usageFor } from "@/components/dev/fixtures";
import { AnalyticsView, RANGES, type RangeDays } from "@/components/app/AnalyticsView";
import { analyticsFor, monthsFor } from "./fixtures";

/**
 * /dev/ops/analytics: the design's seeded charts. `?days=7|30|90`, `?plan=pilot` (500 minutes
 * included), `?state=error` (call analytics failed), `?state=usage-error` (monthly usage failed),
 * `?state=no-plan` (included minutes unknown).
 */
export default async function AnalyticsPreview({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams;
  const days: RangeDays = RANGES.find((d) => String(d) === q["days"]) ?? 30;
  const plan = q["plan"] === "pilot" ? "pilot" : "standard";
  const usage = usageFor(plan);
  const state = q["state"];
  const a = analyticsFor(days);
  return (
    <DevAppFrame plan={plan} role={q["role"] === "front_desk" ? "front_desk" : "owner"}>
      <AnalyticsView
        analytics={state === "error" ? { ok: false } : { ok: true, data: a }}
        months={
          state === "usage-error"
            ? { ok: false }
            : { ok: true, data: monthsFor(Math.ceil(usage.callSeconds / 60)) }
        }
        days={days}
        from={a.from}
        to={a.to}
        includedMinutes={state === "no-plan" ? undefined : usage.includedCallMinutes}
      />
    </DevAppFrame>
  );
}
