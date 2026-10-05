import type { Clinic, Notification } from "@muxaris/shared";
import { requireActiveClinic, serverApi } from "@/lib/api-server";
import { NotificationsView } from "@/components/app/NotificationsView";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const active = await requireActiveClinic();
  const [{ clinic }, list] = await Promise.all([
    serverApi<{ clinic: Clinic }>(`/v1/clinics/${active.clinicId}`),
    serverApi<{ notifications: Notification[]; total: number }>("/v1/notifications?limit=50"),
  ]);
  return (
    <div className="max-w-5xl px-4 py-8 sm:px-8">
      <h1 className="font-display mb-2 text-3xl">Notifications</h1>
      <p className="text-muted mb-6 text-[15px]">
        Confirmations and reminders go by email to patients with an email on file. SMS and WhatsApp
        are coming soon.
      </p>
      <NotificationsView
        key={active.clinicId}
        initial={list.notifications}
        initialTotal={list.total}
        tz={clinic.timezone}
      />
    </div>
  );
}
