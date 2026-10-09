"use client";

import type { Appointment } from "@muxaris/shared";
import { addDays, localDateKey } from "@/lib/dashboard";
import { cn } from "@/components/ui";
import { keyDayShort, keyWeekday } from "../format";
import { doctorColor, patientName, timeRange, type CalendarDoctor } from "./shared";

/** Monday of the week holding `date` (YYYY-MM-DD), as the design's week view starts. */
export function mondayOf(date: string, weekday: number): string {
  return addDays(date, weekday === 0 ? -6 : 1 - weekday);
}

/** Week view from AppAppointments.dc.html: seven day columns, Monday first. */
export function WeekGrid({
  monday,
  appointments,
  doctors,
  serviceNames,
  tz,
  today,
  onOpen,
}: {
  monday: string;
  appointments: Appointment[];
  doctors: CalendarDoctor[];
  serviceNames: Record<string, string>;
  tz: string;
  today: string;
  onOpen: (a: Appointment) => void;
}) {
  const colors = new Map(doctors.map((d, i) => [d.id, doctorColor(d.color, i)]));
  const byDay = new Map<string, Appointment[]>();
  for (const a of appointments) {
    const k = localDateKey(a.startsAt, tz);
    byDay.set(k, [...(byDay.get(k) ?? []), a]);
  }
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  return (
    <div className="grid grid-cols-1 gap-[10px] sm:grid-cols-2 lg:grid-cols-7">
      {days.map((day) => {
        const isToday = day === today;
        const items = (byDay.get(day) ?? []).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
        return (
          <section
            key={day}
            aria-label={`${keyWeekday(day)}, ${keyDayShort(day)}`}
            className={cn(
              "flex min-w-0 flex-col gap-[8px] rounded-14 border p-[10px] lg:min-h-[320px]",
              isToday ? "border-teal-border bg-surface" : "border-line bg-white/55",
            )}
          >
            <div className="flex items-center justify-between px-[4px] pt-[2px] pb-[6px]">
              <div className="flex flex-col leading-[1.2]">
                <span className="text-muted font-mono text-[11px] tracking-[0.06em] uppercase">
                  {keyWeekday(day)}
                </span>
                <span className="text-[18px] font-semibold tracking-[-0.02em]">
                  {keyDayShort(day)}
                </span>
              </div>
              {isToday ? (
                <span className="bg-teal grid h-[20px] place-items-center rounded-6 px-[7px] text-[11px] font-semibold text-white">
                  Today
                </span>
              ) : null}
            </div>
            {items.map((a) => {
              const cancelled = a.status === "cancelled";
              const color = colors.get(a.doctorId) ?? "#8a95a5";
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onOpen(a)}
                  className={cn(
                    "flex cursor-pointer flex-col items-start gap-[2px] rounded-9 border px-[9px] py-[8px] text-left hover:shadow-[0_8px_18px_-12px_rgba(12,18,32,0.45)]",
                    cancelled && "bg-subtle border-line-strong border-dashed opacity-[0.62]",
                  )}
                  style={
                    cancelled ? undefined : { background: `${color}14`, borderColor: `${color}55` }
                  }
                >
                  <span className="text-ink-2 font-mono text-[11px]">{timeRange(a, tz)}</span>
                  <span
                    className={cn(
                      "text-[12.5px] leading-[1.3] font-semibold",
                      cancelled && "line-through",
                    )}
                  >
                    {serviceNames[a.serviceId] ?? "Appointment"}
                  </span>
                  <span className="text-muted text-[12px]">{patientName(a)}</span>
                </button>
              );
            })}
            {items.length === 0 ? (
              <span className="text-muted-2 p-[4px] text-[12.5px] italic">Nothing booked.</span>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
