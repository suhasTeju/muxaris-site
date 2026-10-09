import { DevAppFrame } from "@/components/dev/DevAppFrame";
import { clinic, usageFor } from "@/components/dev/fixtures";
import { OverviewView } from "@/components/app/OverviewView";
import { NOW, TZ, calls, overviewStats, param, todayAppointments } from "../_data";

/**
 * /dev/core/overview
 *   ?role=front_desk   front-desk header
 *   ?plan=pilot        pilot minutes (meter in its hot state)
 *   ?state=error       every section failed to load
 *   ?state=empty       a quiet day: no calls, no appointments
 */
export default async function OverviewPreview({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams;
  const plan = param(q, "plan") === "pilot" ? "pilot" : "standard";
  const state = param(q, "state");
  const failed = { ok: false as const };
  const empty = state === "empty";
  return (
    <DevAppFrame role={param(q, "role") === "front_desk" ? "front_desk" : "owner"} plan={plan}>
      <OverviewView
        clinicName={clinic.name}
        tz={TZ}
        now={NOW}
        stats={
          state === "error"
            ? failed
            : {
                ok: true,
                data: empty
                  ? { ...overviewStats, callsToday: 0, bookedToday: 0, avgDurationS: null }
                  : overviewStats,
              }
        }
        usage={state === "error" ? failed : { ok: true, data: usageFor(plan) }}
        appointments={
          state === "error"
            ? failed
            : {
                ok: true,
                data: empty ? { ...todayAppointments, appointments: [] } : todayAppointments,
              }
        }
        recentCalls={
          state === "error" ? failed : { ok: true, data: empty ? [] : calls.slice(0, 5) }
        }
      />
    </DevAppFrame>
  );
}
