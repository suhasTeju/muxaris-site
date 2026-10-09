import { PhoneCall } from "lucide-react";
import { ButtonLink, PageHeader } from "@/components/ui";
import { CallFilters, type CallFilterValue } from "../CallFilters";

/** Page frame from AppCalls.dc.html: title with the call count, test-call link, filters, list. */
export function CallsPageView({
  total,
  filterValue,
  browser,
}: {
  total: number;
  filterValue: CallFilterValue;
  browser: React.ReactNode;
}) {
  return (
    <div className="animate-mx-in flex flex-col gap-[18px]">
      <PageHeader
        title="Calls"
        subtitle={`${total} call${total === 1 ? "" : "s"}`}
        actions={
          <ButtonLink
            href="/app/assistant/try"
            variant="secondary"
            icon={PhoneCall}
            className="font-semibold"
          >
            Place a test call
          </ButtonLink>
        }
      />
      <CallFilters value={filterValue} />
      {browser}
    </div>
  );
}
