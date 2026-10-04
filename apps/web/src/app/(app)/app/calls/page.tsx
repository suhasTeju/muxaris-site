import type { Call, Clinic } from "@muxaris/shared";
import { callOutcomeEnum, callStatusEnum } from "@muxaris/shared";
import { requireActiveClinic, serverApi } from "@/lib/api-server";
import { CALLS_PAGE_SIZE, addDays, startOfLocalDay } from "@/lib/dashboard";
import { CallsBrowser } from "@/components/app/CallsBrowser";
import { CallFilters, type CallFilterValue } from "@/components/app/CallFilters";

export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function CallsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const active = await requireActiveClinic();
  const { clinic } = await serverApi<{ clinic: Clinic }>(`/v1/clinics/${active.clinicId}`);

  // Only well-formed values reach the API; anything else is ignored rather than 400ing the page.
  const outcome = callOutcomeEnum.safeParse(one(sp.outcome));
  const status = callStatusEnum.safeParse(one(sp.status));
  const fromRaw = one(sp.from);
  const toRaw = one(sp.to);
  const value: CallFilterValue = {
    outcome: outcome.success ? outcome.data : undefined,
    status: status.success ? status.data : undefined,
    from: fromRaw && DATE.test(fromRaw) ? fromRaw : undefined,
    to: toRaw && DATE.test(toRaw) ? toRaw : undefined,
  };
  // Dates are clinic-local days; "to" is inclusive, so the API range ends at the next local midnight.
  const filters: Record<string, string> = {};
  if (value.outcome) filters.outcome = value.outcome;
  if (value.status) filters.status = value.status;
  if (value.from) filters.from = startOfLocalDay(value.from, clinic.timezone).toISOString();
  if (value.to) filters.to = startOfLocalDay(addDays(value.to, 1), clinic.timezone).toISOString();

  const { calls } = await serverApi<{ calls: Call[] }>(
    `/v1/calls?${new URLSearchParams({ ...filters, limit: String(CALLS_PAGE_SIZE) })}`,
  );
  return (
    <div className="px-4 py-8 sm:px-8">
      <h1 className="font-display mb-6 text-3xl">Calls</h1>
      <CallFilters value={value} />
      <CallsBrowser
        key={`${active.clinicId}|${new URLSearchParams(filters)}`}
        initial={calls}
        tz={clinic.timezone}
        filters={filters}
      />
    </div>
  );
}
