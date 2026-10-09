/**
 * Display formats from the design's App script (`h.date`, `h.dateLong`, `h.dayShort`, `h.dur`,
 * `h.clock`, `h.mask`), applied to API values: ISO instants are read in the clinic's timezone,
 * `YYYY-MM-DD` keys are calendar dates.
 */
import { DEFAULT_TZ } from "@/lib/dashboard";
import { formatIndianPhone } from "@/lib/phone";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function zone(tz: string | undefined): string {
  const z = tz || DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: z });
    return z;
  } catch {
    return DEFAULT_TZ;
  }
}

export interface LocalParts {
  /** `YYYY-MM-DD` in the zone. */
  key: string;
  year: number;
  /** 1–12. */
  month: number;
  day: number;
  /** 0 = Sunday. */
  weekday: number;
  hour: number;
  minute: number;
}

/** Wall-clock parts of an instant in the clinic's timezone. */
export function localParts(iso: string | Date, tz?: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone(tz),
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  }).formatToParts(typeof iso === "string" ? new Date(iso) : iso);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  return {
    key: `${get("year")}-${get("month")}-${get("day")}`,
    year,
    month,
    day,
    weekday: WD.indexOf(get("weekday")),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
  };
}

/** Minutes since local midnight. */
export function minutesOfDay(iso: string | Date, tz?: string): number {
  const p = localParts(iso, tz);
  return p.hour * 60 + p.minute;
}

function keyParts(key: string): { y: number; m: number; d: number; wd: number } {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  return { y, m, d, wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** `v` when it is a real calendar date as `YYYY-MM-DD` ("2026-02-30" and "2026-13-45" are not). */
export function validDateKey(v: string | undefined): string | undefined {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : undefined;
}

/** "Fri, 9 Oct 2026" for a `YYYY-MM-DD` key (the design's `h.dateLong`). */
export function keyDateLong(key: string): string {
  const { y, m, d, wd } = keyParts(key);
  return `${WD[wd]}, ${d} ${MON[m - 1]} ${y}`;
}

/** "Fri, 9 Oct" for a `YYYY-MM-DD` key (`h.date`). */
export function keyDate(key: string): string {
  const { m, d, wd } = keyParts(key);
  return `${WD[wd]}, ${d} ${MON[m - 1]}`;
}

/** "9 Oct" for a `YYYY-MM-DD` key (`h.dayShort`). */
export function keyDayShort(key: string): string {
  const { m, d } = keyParts(key);
  return `${d} ${MON[m - 1]}`;
}

/** "Fri" for a `YYYY-MM-DD` key (`h.wd`). */
export function keyWeekday(key: string): string {
  return WD[keyParts(key).wd]!;
}

/** 0 = Sunday, for a `YYYY-MM-DD` key. */
export function keyWeekdayIndex(key: string): number {
  return keyParts(key).wd;
}

/** "12 Mar 1994": a date of birth (dateLong without the weekday). */
export function keyDob(key: string): string {
  const { y, m, d } = keyParts(key);
  return `${d} ${MON[m - 1]} ${y}`;
}

/** "Fri, 9 Oct 2026" for an instant in the clinic's zone. */
export function formatDateLong(iso: string, tz?: string): string {
  return keyDateLong(localParts(iso, tz).key);
}

/** "8 Oct" for an instant in the clinic's zone. */
export function formatDayShort(iso: string, tz?: string): string {
  return keyDayShort(localParts(iso, tz).key);
}

/** "4:30 pm" from minutes since midnight (`h.time`). */
export function clockTime(minutes: number): string {
  const hh = Math.floor(minutes / 60) % 24;
  const mm = minutes % 60;
  return `${hh % 12 || 12}:${String(mm).padStart(2, "0")} ${hh >= 12 ? "pm" : "am"}`;
}

/** "1m 18s", always with minutes (`h.dur`); "–" while unknown. */
export function formatDur(seconds: number | null | undefined): string {
  if (seconds == null) return "–";
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

/** "0:21" (`h.clock`). */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * A revealed number as the design prints it: "+91 98451 23210" for a mobile, "+91 80 4123 4567" for
 * a landline (`formatIndianPhone` in @muxaris/shared); anything else is shown as given.
 */
export function formatPhone(raw: string): string {
  return formatIndianPhone(raw);
}

/** Up to two initials, "?" without a name (the design's avatar). */
export function initials(name: string | null | undefined): string {
  const n = name?.trim();
  if (!n) return "?";
  return n
    .split(/\s+/)
    .map((x) => x[0])
    .slice(0, 2)
    .join("");
}

/** "Today" or "Thu, 8 Oct" for an instant, relative to `todayKey`. */
export function relativeDay(iso: string, todayKey: string, tz?: string): string {
  const key = localParts(iso, tz).key;
  return key === todayKey ? "Today" : keyDate(key);
}
