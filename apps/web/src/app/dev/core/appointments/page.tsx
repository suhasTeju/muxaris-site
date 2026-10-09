import { DevAppFrame } from "@/components/dev/DevAppFrame";
import { AppointmentsBoard } from "@/components/app/appointments/AppointmentsBoard";
import { FixtureApi } from "../_lib/FixtureApi";
import { NOW, TZ, param } from "../_data";

const DIALOGS = ["new", "reschedule", "cancel"] as const;

/**
 * /dev/core/appointments              today (Fri 9 Oct) by doctor, with the NOW line
 *   ?view=week                         the week of 5–11 Oct
 *   ?date=2026-10-12                   another day
 *   ?state=empty                       nothing booked
 *   ?id=a7                             drawer for an upcoming appointment (Reschedule / Cancel)
 *   ?id=a3                             drawer for one that has ended (Completed / No-show)
 *   ?id=a1                             drawer for a completed one (no actions)
 *   ?dialog=new                        New appointment (the first slot reports "just taken" once)
 *   ?id=a7&dialog=reschedule | cancel  the Reschedule or Cancel dialog
 * Everything is live against the in-memory fixture API: book, reschedule, cancel, mark outcomes.
 */
export default async function AppointmentsPreview({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams;
  const dialog = DIALOGS.find((d) => d === param(q, "dialog"));
  const date = param(q, "date");
  return (
    <DevAppFrame role={param(q, "role") === "front_desk" ? "front_desk" : "owner"}>
      <FixtureApi empty={param(q, "state") === "empty"} conflictOnce>
        <AppointmentsBoard
          tz={TZ}
          now={NOW}
          initialDate={date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined}
          initialMode={param(q, "view") === "week" ? "week" : "day"}
          initialId={param(q, "id")}
          initialDialog={dialog}
        />
      </FixtureApi>
    </DevAppFrame>
  );
}
