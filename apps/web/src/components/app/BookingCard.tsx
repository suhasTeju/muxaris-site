import Link from "next/link";
import { formatDateTime } from "@/lib/dashboard";

export function BookingCard({
  booking,
  tz,
}: {
  booking: { appointmentId: string; doctorName: string; serviceName: string; startsAt: string };
  tz: string;
}) {
  return (
    <section
      aria-label="Appointment booked"
      className="border-accent bg-accent-soft rounded-2xl border p-5"
    >
      <p className="text-accent-deep text-sm font-medium">Appointment booked</p>
      <p className="font-display mt-1 text-2xl">{booking.serviceName}</p>
      <p className="mt-1 text-[15px]">
        {booking.doctorName} · {formatDateTime(booking.startsAt, tz)}
      </p>
      <Link
        href="/app/appointments"
        className="text-accent-deep mt-3 inline-flex min-h-11 items-center text-[15px] font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
      >
        View in appointments
      </Link>
    </section>
  );
}
