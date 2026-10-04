"use client";

import type { Appointment } from "@muxaris/shared";
import { formatDay, localDateKey, startOfLocalDay } from "@/lib/dashboard";
import { AppointmentList, type AppointmentListProps } from "./AppointmentList";

/** One section per local day in `days` (YYYY-MM-DD), each listing that day's appointments by doctor. */
export function DayCalendar({
  days,
  ...list
}: { days: string[] } & Omit<AppointmentListProps, "emptyText">) {
  const byDay = new Map<string, Appointment[]>();
  for (const a of list.appointments) {
    const k = localDateKey(a.startsAt, list.tz);
    byDay.set(k, [...(byDay.get(k) ?? []), a]);
  }
  const today = localDateKey(new Date(), list.tz);
  return (
    <div className="flex flex-col gap-8">
      {days.map((d) => (
        <section key={d} aria-label={d}>
          <h2 className="font-display mb-3 text-xl">
            {formatDay(startOfLocalDay(d, list.tz).toISOString(), list.tz)}
            {d === today ? <span className="text-accent-deep ml-2 text-sm">Today</span> : null}
          </h2>
          <AppointmentList
            {...list}
            appointments={byDay.get(d) ?? []}
            emptyText="Nothing booked."
          />
        </section>
      ))}
    </div>
  );
}
