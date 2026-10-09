import { DevAppFrame } from "@/components/dev/DevAppFrame";
import { FIXTURE_TODAY, callbacks, clinic } from "@/components/dev/fixtures";
import { CallbacksQueue } from "@/components/app/CallbacksQueue";

/**
 * /dev/ops/callbacks: the Callbacks page with the design's seed data.
 * `?tab=done` opens the Done tab, `?state=empty` shows both empty states, `?role=front_desk`.
 */
export default async function CallbacksPreview({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams;
  const empty = q["state"] === "empty";
  const open = empty ? [] : callbacks.filter((c) => c.status === "open");
  const done = empty ? [] : callbacks.filter((c) => c.status === "done");
  return (
    <DevAppFrame
      role={q["role"] === "front_desk" ? "front_desk" : "owner"}
      openCallbacks={open.length}
    >
      <CallbacksQueue
        initial={open}
        initialTotal={open.length}
        initialDone={{ items: done, total: done.length }}
        initialTab={q["tab"] === "done" ? "done" : "open"}
        tz={clinic.timezone}
        today={FIXTURE_TODAY}
      />
    </DevAppFrame>
  );
}
