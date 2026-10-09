import { notFound } from "next/navigation";
import { DevAppFrame } from "@/components/dev/DevAppFrame";
import { callTurns, callbacks } from "@/components/dev/fixtures";
import { CallDetail } from "@/components/app/CallDetail";
import { FixtureApi } from "../../_lib/FixtureApi";
import { TZ, calls, param } from "../../_data";

const REC = ["ready", "pending", "missing", "error"] as const;

/**
 * /dev/core/calls/c1   booked call with transcript, tool chips and extracted details
 * /dev/core/calls/c5   handoff: failed tool chip, negative sentiment, callback from this call
 * /dev/core/calls/c7   outcome edited by staff
 * /dev/core/calls/c4   abandoned (no recording, no transcript, no caller speech)
 * /dev/core/calls/c8   browser test call
 * /dev/core/calls/c12  failed call (recording unavailable)
 * /dev/core/calls/c14  purged after 90 days
 *   ?rec=pending|missing|error   recording still being saved, gone (404), or failing (Retry)
 */
export default async function CallDetailPreview({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const call = calls.find((c) => c.id === id);
  if (!call) notFound();
  // The gateway records zero caller turns on a call nobody spoke on (the fixtures leave metrics
  // empty), which is what makes the summary say "No caller speech to summarise."
  const initial =
    call.status === "abandoned" ? { ...call, metrics: { ...call.metrics, userTurns: 0 } } : call;
  const rec = REC.find((r) => r === param(q, "rec")) ?? "ready";
  return (
    <DevAppFrame role={param(q, "role") === "front_desk" ? "front_desk" : "owner"}>
      <FixtureApi recording={rec}>
        <CallDetail
          key={call.id}
          initialCall={initial}
          turns={callTurns[call.id] ?? []}
          callbacks={callbacks.filter((c) => c.callId === call.id)}
          tz={TZ}
          patientName={call.patientName ?? null}
        />
      </FixtureApi>
    </DevAppFrame>
  );
}
