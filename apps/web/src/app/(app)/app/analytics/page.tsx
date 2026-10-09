import type { CallAnalytics, Clinic, MonthlyUsage, UsageSummary } from "@muxaris/shared";
import { requireActiveClinic, serverApi } from "@/lib/api-server";
import { addDays, localDateKey, toSection } from "@/lib/dashboard";
import { AnalyticsView, RANGES, type RangeDays } from "@/components/app/AnalyticsView";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.days) ? sp.days[0] : sp.days;
  const days: RangeDays = RANGES.find((d) => String(d) === raw) ?? 30;
  const active = await requireActiveClinic();
  const { clinic } = await serverApi<{ clinic: Clinic }>(`/v1/clinics/${active.clinicId}`);
  const tz = clinic.timezone;
  const to = localDateKey(new Date(), tz);
  const from = addDays(to, -(days - 1));
  const [calls, usage, plan] = await Promise.allSettled([
    serverApi<CallAnalytics>(`/v1/analytics/calls?${new URLSearchParams({ from, to })}`),
    serverApi<{ months: MonthlyUsage[] }>("/v1/analytics/usage?months=6"),
    // Only for the "min included" line on Minutes per month.
    serverApi<UsageSummary>("/v1/usage"),
  ]);
  const usageSection = toSection(usage);
  return (
    <AnalyticsView
      analytics={toSection(calls)}
      months={usageSection.ok ? { ok: true, data: usageSection.data.months } : usageSection}
      days={days}
      from={from}
      to={to}
      includedMinutes={
        plan.status === "fulfilled" && typeof plan.value.includedCallMinutes === "number"
          ? plan.value.includedCallMinutes
          : undefined
      }
      tz={tz}
    />
  );
}
