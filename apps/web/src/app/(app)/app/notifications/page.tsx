import {
  NOTIFICATION_STATUSES,
  type Clinic,
  type Notification,
  type NotificationStatus,
} from "@muxaris/shared";
import { requireActiveClinic, serverApi } from "@/lib/api-server";
import { NotificationsView } from "@/components/app/NotificationsView";

export const dynamic = "force-dynamic";

type Page = { notifications: Notification[]; total: number };

export default async function NotificationsPage() {
  const active = await requireActiveClinic();
  const [{ clinic }, list, ...totals] = await Promise.all([
    serverApi<{ clinic: Clinic }>(`/v1/clinics/${active.clinicId}`),
    serverApi<Page>("/v1/notifications?limit=50"),
    // One-row pages, only for each tab's count; a tab without one gets it when opened.
    ...NOTIFICATION_STATUSES.map((s) =>
      serverApi<Page>(`/v1/notifications?status=${s}&limit=1`).then(
        (r) => r.total,
        () => undefined,
      ),
    ),
  ]);
  const counts: Partial<Record<NotificationStatus, number>> = {};
  NOTIFICATION_STATUSES.forEach((s, i) => {
    const n = totals[i];
    if (typeof n === "number") counts[s] = n;
  });
  return (
    <NotificationsView
      key={active.clinicId}
      initial={list.notifications}
      initialTotal={list.total}
      counts={counts}
      tz={clinic.timezone}
    />
  );
}
