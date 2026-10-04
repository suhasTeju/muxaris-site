import { addMinutes } from "date-fns";
import {
  assertDateString,
  assertTimeString,
  atLocal,
  daysBetween,
  localDateString,
  partOfDayOf,
  weekdayOf,
} from "./time.js";
export { localDateString, partOfDayOf } from "./time.js";

export interface SlotRules {
  slotGrainMin: number;
  leadTimeMin: number;
  maxDaysAhead: number;
  allowSameDay: boolean;
  /** Capacity per slot; NOTE: findSlots ignores this (enforced by the booking layer). */
  maxPerSlot: number;
}
export interface DoctorAvailability {
  doctorId: string;
  workingHours: Array<{ weekday: number; startTime: string; endTime: string }>;
  timeOff: Array<{ startsAt: Date; endsAt: Date }>;
}
export interface ServiceSpec {
  serviceId: string;
  durationMin: number;
  bufferMin: number;
}
export interface ExistingAppointment {
  doctorId: string;
  startsAt: Date;
  /** MUST already include the appointment's own service buffer */
  endsAt: Date;
}
export interface FindSlotsInput {
  /** YYYY-MM-DD */
  date: string;
  timezone: string;
  now: Date;
  rules: SlotRules;
  doctors: DoctorAvailability[];
  service: ServiceSpec;
  /** YYYY-MM-DD */
  holidays: string[];
  appointments: ExistingAppointment[];
  partOfDay?: "morning" | "afternoon" | "evening";
}
export interface Slot {
  doctorId: string;
  startsAt: Date;
  endsAt: Date;
}

const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) =>
  aStart < bEnd && bStart < aEnd;

export function findSlots(i: FindSlotsInput): Slot[] {
  assertDateString(i.date);
  for (const h of i.holidays) assertDateString(h);
  for (const k of ["maxDaysAhead", "leadTimeMin"] as const) {
    if (!Number.isFinite(i.rules[k]) || i.rules[k] < 0) {
      throw new RangeError(`${k} must be a finite number >= 0, got ${i.rules[k]}`);
    }
  }
  if (!(i.rules.slotGrainMin > 0)) {
    throw new RangeError(`slotGrainMin must be > 0, got ${i.rules.slotGrainMin}`);
  }
  const today = localDateString(i.now, i.timezone);
  const dayDiff = daysBetween(today, i.date);
  if (dayDiff < 0 || dayDiff > i.rules.maxDaysAhead) return [];
  if (dayDiff === 0 && !i.rules.allowSameDay) return [];
  if (i.holidays.includes(i.date)) return [];
  const earliest = addMinutes(i.now, i.rules.leadTimeMin);
  const need = i.service.durationMin + i.service.bufferMin;
  const weekday = weekdayOf(i.date, i.timezone);
  const out: Slot[] = [];
  const seen = new Set<string>();
  for (const doc of i.doctors) {
    const busy = i.appointments
      .filter((a) => a.doctorId === doc.doctorId)
      .map((a) => ({ s: a.startsAt, e: a.endsAt }));
    for (const wh of doc.workingHours.filter((w) => w.weekday === weekday)) {
      assertTimeString(wh.startTime);
      assertTimeString(wh.endTime, true);
      const open = atLocal(i.date, wh.startTime, i.timezone);
      let close = atLocal(i.date, wh.endTime, i.timezone);
      if (close <= open) {
        // Only an end of exactly midnight ("00:00" / "24:00") crosses into the next day.
        if (wh.endTime !== "00:00" && wh.endTime !== "24:00") {
          throw new RangeError("working hours end must be after start");
        }
        if (wh.startTime === "00:00" && wh.endTime === "00:00") {
          throw new RangeError("working hours end must be after start");
        }
        close = atLocal(i.date, "00:00", i.timezone, 1);
      }
      for (let t = open; addMinutes(t, need) <= close; t = addMinutes(t, i.rules.slotGrainMin)) {
        if (t < earliest) continue;
        const endWithBuffer = addMinutes(t, need);
        if (busy.some((b) => overlaps(t, endWithBuffer, b.s, b.e))) continue;
        if (doc.timeOff.some((o) => overlaps(t, endWithBuffer, o.startsAt, o.endsAt))) continue;
        if (i.partOfDay && partOfDayOf(t, i.timezone) !== i.partOfDay) continue;
        const key = `${doc.doctorId}|${t.getTime()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          doctorId: doc.doctorId,
          startsAt: t,
          endsAt: addMinutes(t, i.service.durationMin),
        });
      }
    }
  }
  return out.sort(
    (a, b) =>
      a.startsAt.getTime() - b.startsAt.getTime() ||
      (a.doctorId < b.doctorId ? -1 : a.doctorId > b.doctorId ? 1 : 0),
  );
}
