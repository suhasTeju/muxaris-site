import { DevAppFrame } from "@/components/dev/DevAppFrame";
import { EmptyState, PageHeader } from "@/components/ui";

/**
 * /dev/shell?role=front_desk&plan=pilot&clinics=2: the app shell around a placeholder page.
 * `&stream=1500` streams the minutes and the badge in after 1.5s, as the real layout does.
 */
export default async function DevShell({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams;
  return (
    <DevAppFrame
      role={q["role"] === "front_desk" ? "front_desk" : "owner"}
      plan={q["plan"] === "pilot" ? "pilot" : "standard"}
      multiClinic={q["clinics"] === "2"}
      streamDelayMs={typeof q["stream"] === "string" ? Number(q["stream"]) || 0 : undefined}
    >
      <div className="animate-mx-in flex flex-col gap-[22px]">
        <PageHeader title="Overview" subtitle="Friday, 9 October · Sunrise Dental Care" />
        <EmptyState>Page content goes here.</EmptyState>
      </div>
    </DevAppFrame>
  );
}
