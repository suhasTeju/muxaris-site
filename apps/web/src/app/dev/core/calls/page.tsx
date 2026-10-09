import { DevAppFrame } from "@/components/dev/DevAppFrame";
import { calls } from "@/components/dev/fixtures";
import { CallsBrowser } from "@/components/app/CallsBrowser";
import { CallsPageView } from "@/components/app/calls/CallsPageView";
import { localDateKey } from "@/lib/dashboard";
import { NOW, TZ, names, param } from "../_data";

/**
 * /dev/core/calls
 *   ?outcome=booked&status=completed&from=2026-10-08&to=2026-10-09   URL filters, applied to the fixtures
 *   ?state=empty    no calls yet (the "Place a test call" empty state)
 */
export default async function CallsPreview({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams;
  const value = {
    outcome: param(q, "outcome") || undefined,
    status: param(q, "status") || undefined,
    from: param(q, "from") || undefined,
    to: param(q, "to") || undefined,
  };
  const list =
    param(q, "state") === "empty"
      ? []
      : calls.filter((c) => {
          const day = localDateKey(c.startedAt, TZ);
          return (
            (!value.outcome || c.outcome === value.outcome) &&
            (!value.status || c.status === value.status) &&
            (!value.from || day >= value.from) &&
            (!value.to || day <= value.to)
          );
        });
  const filters = Object.fromEntries(Object.entries(value).filter(([, v]) => v)) as Record<
    string,
    string
  >;
  return (
    <DevAppFrame role={param(q, "role") === "front_desk" ? "front_desk" : "owner"}>
      <CallsPageView
        total={list.length}
        filterValue={value}
        browser={
          <CallsBrowser
            key={JSON.stringify(filters)}
            initial={list}
            tz={TZ}
            filters={filters}
            now={NOW}
            names={names}
          />
        }
      />
    </DevAppFrame>
  );
}
