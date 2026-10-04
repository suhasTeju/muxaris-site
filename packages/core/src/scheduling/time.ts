import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
export const localDateString = (d: Date, tz: string) => format(new TZDate(d, tz), "yyyy-MM-dd");
export function partOfDayOf(d: Date, tz: string): "morning" | "afternoon" | "evening" {
  const h = new TZDate(d, tz).getHours();
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}
/** Build a Date for local wall-clock time on a calendar date in tz. */
export function atLocal(date: string, hhmm: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [hh, mm] = hhmm.split(":").map(Number) as [number, number];
  return new Date(new TZDate(y, m - 1, d, hh, mm, 0, tz).getTime());
}
export const weekdayOf = (date: string, tz: string) =>
  new TZDate(atLocal(date, "12:00", tz), tz).getDay();
