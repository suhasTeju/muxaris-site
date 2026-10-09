import Link from "next/link";
import { ArrowRight, CalendarCheck } from "lucide-react";
import { formatDateTime } from "@/lib/dashboard";

/** Try your assistant: the appointment the assistant just booked, with a way to it. */
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
      className="flex animate-[mxSheet_.35s_ease_both] flex-col gap-[10px] rounded-16 border border-[#bfe5cb] bg-[#f0faf3] p-[16px]"
    >
      <span className="text-green-ink flex items-center gap-[8px] font-mono text-[11px] tracking-[0.08em] uppercase">
        <CalendarCheck size={14} aria-hidden="true" />
        Appointment booked
      </span>
      <div className="flex flex-col gap-[2px]">
        <span className="text-[16px] font-semibold">{booking.serviceName}</span>
        <span className="text-ink-2 text-[13.5px]">
          {booking.doctorName} · {formatDateTime(booking.startsAt, tz)}
        </span>
      </div>
      <Link
        href="/app/appointments"
        className="text-green-ink inline-flex items-center gap-[6px] self-start text-[13.5px] font-semibold"
      >
        View in appointments
        <ArrowRight size={13} aria-hidden="true" />
      </Link>
    </section>
  );
}
