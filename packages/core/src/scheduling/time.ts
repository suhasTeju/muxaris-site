import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
export const localDateString = (d: Date, tz: string) => format(new TZDate(d, tz), "yyyy-MM-dd");
export function partOfDayOf(d: Date, tz: string): "morning" | "afternoon" | "evening" {
  const h = new TZDate(d, tz).getHours();
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/** Throws RangeError unless `date` is a real calendar date in strict YYYY-MM-DD form. */
export function assertDateString(date: string): void {
  if (!DATE_RE.test(date)) throw new RangeError(`Invalid date "${date}": expected YYYY-MM-DD`);
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.toISOString().slice(0, 10) !== date) {
    throw new RangeError(`Invalid date "${date}": not a real calendar date`);
  }
}

/** Whole days from calendar date `a` to `b` (YYYY-MM-DD), independent of any timezone. */
export function daysBetween(a: string, b: string): number {
  const utc = (s: string) => {
    const [y, m, d] = s.split("-").map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(b) - utc(a)) / 86_400_000);
}

/**
 * Throws RangeError unless `hhmm` is strict HH:mm. "24:00" is valid only when
 * `allowMidnightEnd` is true (end times).
 */
export function assertTimeString(hhmm: string, allowMidnightEnd = false): void {
  if (!TIME_RE.test(hhmm)) throw new RangeError(`Invalid time "${hhmm}": expected HH:mm`);
  const [hh, mm] = hhmm.split(":").map(Number) as [number, number];
  if (mm > 59 || hh > 24 || (hh === 24 && (mm > 0 || !allowMidnightEnd))) {
    throw new RangeError(`Invalid time "${hhmm}": out of range`);
  }
}

/** Build a Date for local wall-clock time on a calendar date in tz (dayOffset shifts the calendar day). */
export function atLocal(date: string, hhmm: string, tz: string, dayOffset = 0): Date {
  assertDateString(date);
  assertTimeString(hhmm, true);
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [hh, mm] = hhmm.split(":").map(Number) as [number, number];
  const out = new Date(new TZDate(y, m - 1, d + dayOffset, hh, mm, 0, tz).getTime());
  if (dayOffset === 0 && hh < 24 && localDateString(out, tz) !== date) {
    throw new RangeError(`Invalid local time "${date} ${hhmm}" in ${tz}`);
  }
  return out;
}
export const weekdayOf = (date: string, tz: string) =>
  new TZDate(atLocal(date, "12:00", tz), tz).getDay();
