"use client";

import type { Appointment } from "@muxaris/shared";
import { Card, cn } from "@/components/ui";
import { clockTime, keyWeekdayIndex, minutesOfDay } from "../core/format";
import { StatusBadge } from "../core/StatusBadge";
import {
  doctorColor,
  doctorInitials,
  isPast,
  patientName,
  timeRange,
  type CalendarDoctor,
} from "./shared";

/** One hour is 88px tall, as in the design. */
export const HOUR_PX = 88;
const DEFAULT_START = 10 * 60;
const DEFAULT_END = 20 * 60;

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return h * 60 + m;
};

interface Column {
  id: string;
  name: string;
  color: string;
  items: Appointment[];
}

/**
 * The hours the grid spans: the doctors' working hours that weekday (10 am to 8 pm in the
 * design), widened to whole hours around any appointment that falls outside them.
 */
export function dayHours(
  date: string,
  doctors: CalendarDoctor[],
  appointments: Appointment[],
  tz: string,
): { start: number; end: number } {
  const wd = keyWeekdayIndex(date);
  const hours = doctors.flatMap((d) => (d.workingHours ?? []).filter((h) => h.weekday === wd));
  let start = hours.length ? Math.min(...hours.map((h) => toMin(h.startTime))) : DEFAULT_START;
  let end = hours.length ? Math.max(...hours.map((h) => toMin(h.endTime))) : DEFAULT_END;
  for (const a of appointments) {
    const s = minutesOfDay(a.startsAt, tz);
    const len = Math.max(0, (Date.parse(a.endsAt) - Date.parse(a.startsAt)) / 60_000);
    start = Math.min(start, s);
    end = Math.max(end, Math.min(24 * 60, s + len));
  }
  start = Math.floor(start / 60) * 60;
  end = Math.max(start + 60, Math.ceil(end / 60) * 60);
  return { start, end };
}

function columnsFor(doctors: CalendarDoctor[], appointments: Appointment[]): Column[] {
  const by = new Map<string, Appointment[]>();
  for (const a of appointments) by.set(a.doctorId, [...(by.get(a.doctorId) ?? []), a]);
  const cols: Column[] = doctors
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => d.active || by.has(d.id))
    .map(({ d, i }) => ({
      id: d.id,
      name: d.name,
      color: doctorColor(d.color, i),
      items: by.get(d.id) ?? [],
    }));
  const known = new Set(doctors.map((d) => d.id));
  const orphans = appointments.filter((a) => !known.has(a.doctorId));
  if (orphans.length) {
    cols.push({ id: "unassigned", name: "Unassigned", color: "#8a95a5", items: orphans });
  }
  for (const c of cols) c.items.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return cols;
}

/**
 * Day view from AppAppointments.dc.html: one column per doctor on an hour grid, each appointment a
 * block placed by its time, and the NOW line across today.
 */
export function DayTimeline({
  date,
  appointments,
  doctors,
  serviceNames,
  tz,
  now,
  today,
  onOpen,
}: {
  date: string;
  appointments: Appointment[];
  doctors: CalendarDoctor[];
  serviceNames: Record<string, string>;
  tz: string;
  now: Date;
  /** Today's date in the clinic (YYYY-MM-DD). */
  today: string;
  onOpen: (a: Appointment) => void;
}) {
  const { start, end } = dayHours(date, doctors, appointments, tz);
  const cols = columnsFor(doctors, appointments);
  const gridH = ((end - start) / 60) * HOUR_PX;
  const hours = Array.from({ length: (end - start) / 60 + 1 }, (_, i) => start + i * 60);
  const nowTop = ((minutesOfDay(now, tz) - start) / 60) * HOUR_PX;
  const showNow = date === today && nowTop > 0 && nowTop < gridH;
  const template = `64px repeat(${cols.length}, minmax(0, 1fr))`;

  return (
    <Card aria-label="Day schedule" className="overflow-hidden">
      <div className="overflow-x-auto">
        <div style={{ minWidth: 64 + cols.length * 200 }}>
          <div
            className="border-line bg-surface-2 grid border-b"
            style={{ gridTemplateColumns: template }}
          >
            <span />
            {cols.map((c) => (
              <div
                key={c.id}
                className="border-chip flex items-center gap-[10px] border-l px-[14px] py-[12px]"
              >
                <span
                  aria-hidden
                  className="grid size-[28px] shrink-0 place-items-center rounded-8 text-[12px] font-semibold"
                  style={{ background: `${c.color}1f`, color: c.color }}
                >
                  {doctorInitials(c.name)}
                </span>
                <div className="flex min-w-0 flex-col leading-[1.25]">
                  <span className="truncate text-[14px] font-semibold">{c.name}</span>
                  <span className="text-muted text-[12px]">
                    {c.items.length} {c.items.length === 1 ? "appointment" : "appointments"}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="relative grid" style={{ gridTemplateColumns: template, height: gridH }}>
            <div aria-hidden className="relative">
              {hours.map((m, i) => (
                <span
                  key={m}
                  className="text-muted-2 absolute right-[10px] -translate-y-1/2 font-mono text-[11px]"
                  style={{ top: i * HOUR_PX + (i === 0 ? 8 : 0) }}
                >
                  {clockTime(m).replace(":00", "")}
                </span>
              ))}
            </div>
            {cols.map((c) => (
              <div
                key={c.id}
                role="list"
                aria-label={c.name}
                className="border-chip relative border-l"
                style={{
                  backgroundImage: "linear-gradient(#eef2f6 1px, transparent 1px)",
                  backgroundSize: `100% ${HOUR_PX}px`,
                }}
              >
                {c.items.map((a) => {
                  const cancelled = a.status === "cancelled";
                  const mins = minutesOfDay(a.startsAt, tz);
                  const lenPx =
                    ((Date.parse(a.endsAt) - Date.parse(a.startsAt)) / 3_600_000) * HOUR_PX;
                  return (
                    <div key={a.id} role="listitem">
                      <button
                        type="button"
                        onClick={() => onOpen(a)}
                        className={cn(
                          "absolute right-[6px] left-[6px] flex cursor-pointer flex-col items-start justify-start gap-[1px] overflow-hidden rounded-10 border px-[10px] py-[6px] text-left transition-[box-shadow,transform] duration-150 ease-[ease] hover:-translate-y-px hover:shadow-[0_10px_24px_-14px_rgba(12,18,32,0.45)]",
                          cancelled && "bg-subtle border-line-strong border-dashed",
                        )}
                        style={{
                          top: ((mins - start) / 60) * HOUR_PX + 2,
                          height: Math.max(30, lenPx - 4),
                          opacity: cancelled || isPast(a, now) ? 0.62 : 1,
                          ...(cancelled
                            ? {}
                            : { background: `${c.color}14`, borderColor: `${c.color}55` }),
                        }}
                      >
                        <span className="flex w-full min-w-0 items-center gap-[8px]">
                          <span
                            className={cn(
                              "text-ink min-w-0 truncate text-[13px] font-semibold",
                              cancelled && "line-through",
                            )}
                          >
                            {serviceNames[a.serviceId] ?? "Appointment"} · {patientName(a)}
                          </span>
                          <StatusBadge kind="appt" value={a.status} size={18} className="ml-auto" />
                        </span>
                        {lenPx >= 40 ? (
                          <span className="text-ink-3 font-mono text-[11px]">
                            {timeRange(a, tz)}
                          </span>
                        ) : null}
                        {lenPx > 70 && a.patient?.phoneMasked ? (
                          <span className="text-muted text-[12px]">{a.patient.phoneMasked}</span>
                        ) : null}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
            {showNow ? (
              <div
                aria-hidden
                className="border-teal pointer-events-none absolute right-0 left-[56px] h-0 border-t-[1.5px]"
                style={{ top: nowTop }}
              >
                <span className="bg-teal absolute top-[-5px] left-[-4px] size-[9px] rounded-full" />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  );
}
