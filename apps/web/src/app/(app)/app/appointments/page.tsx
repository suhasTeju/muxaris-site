import { AppointmentsView } from "@/components/app/AppointmentsView";
import { validDateKey } from "@/components/app/format";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * ?id=<appointment> opens that appointment's panel (the Overview links here); ?date=YYYY-MM-DD
 * and ?view=week pick the calendar's starting point. The board writes all three back as you move.
 */
export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams;
  const date = one(q.date);
  const id = one(q.id);
  return (
    <AppointmentsView
      initialDate={validDateKey(date)}
      initialMode={one(q.view) === "week" ? "week" : "day"}
      initialId={id && /^[\w-]{1,64}$/.test(id) ? id : undefined}
    />
  );
}
