import { NOTIFICATION_STATUSES, type NotificationStatus } from "@muxaris/shared";
import { DevAppFrame } from "@/components/dev/DevAppFrame";
import { clinic, notifications } from "@/components/dev/fixtures";
import { NotificationsView } from "@/components/app/NotificationsView";

/**
 * /dev/ops/notifications: the outbox with the design's eleven messages and the "Email designs"
 * button pointing at /dev/ops/emails. `?state=empty` shows the empty outbox, `?role=front_desk`.
 */
export default async function NotificationsPreview({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams;
  const list = q["state"] === "empty" ? [] : notifications;
  const counts = Object.fromEntries(
    NOTIFICATION_STATUSES.map((s) => [s, list.filter((n) => n.status === s).length]),
  ) as Record<NotificationStatus, number>;
  return (
    <DevAppFrame role={q["role"] === "front_desk" ? "front_desk" : "owner"}>
      <NotificationsView
        initial={list}
        initialTotal={list.length}
        counts={counts}
        tz={clinic.timezone}
        designsHref="/dev/ops/emails"
      />
    </DevAppFrame>
  );
}
