import { DevAppFrame } from "@/components/dev/DevAppFrame";
import { EmptyState, PageHeader } from "@/components/ui";

/** /dev/shell?role=front_desk&plan=pilot&clinics=2: the app shell around a placeholder page. */
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
    >
      <div className="animate-mx-in flex flex-col gap-[22px]">
        <PageHeader title="Overview" subtitle="Friday, 9 October · Sunrise Dental Care" />
        <EmptyState>Page content goes here.</EmptyState>
      </div>
    </DevAppFrame>
  );
}
