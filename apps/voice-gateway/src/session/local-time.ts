const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function parts(d: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    timeZoneName: "longOffset",
  });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(d)) o[p.type] = p.value;
  const offset = (o["timeZoneName"] ?? "GMT").replace("GMT", "") || "+00:00";
  return {
    y: Number(o["year"]),
    mo: Number(o["month"]),
    d: Number(o["day"]),
    h: Number(o["hour"]) % 24,
    mi: Number(o["minute"]),
    s: Number(o["second"]),
    wd: o["weekday"] ?? "",
    offset,
  };
}

const p2 = (n: number) => String(n).padStart(2, "0");

/** "2:30 pm" */
export function formatClock(h: number, mi: number): string {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${p2(mi)} ${h < 12 ? "am" : "pm"}`;
}

/** "Tue 6 Oct, 2:30 pm" in the given timezone. */
export function formatLocal(d: Date, tz: string): string {
  const p = parts(d, tz);
  return `${p.wd} ${p.d} ${MONTHS[p.mo - 1]}, ${formatClock(p.h, p.mi)}`;
}

/** "Tue 6 Oct 2026, 2:30 pm" (with year; for the system prompt). */
export function formatLocalLong(d: Date, tz: string): string {
  const p = parts(d, tz);
  return `${p.wd} ${p.d} ${MONTHS[p.mo - 1]} ${p.y}, ${formatClock(p.h, p.mi)}`;
}

/** ISO-8601 with the zone's numeric offset, e.g. 2026-10-06T14:30:00+05:30. */
export function toLocalIso(d: Date, tz: string): string {
  const p = parts(d, tz);
  return `${p.y}-${p2(p.mo)}-${p2(p.d)}T${p2(p.h)}:${p2(p.mi)}:${p2(p.s)}${p.offset}`;
}

export const WEEKDAY_NAMES = WEEKDAYS;

/** Adds whole days to a YYYY-MM-DD string. */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${p2(t.getUTCMonth() + 1)}-${p2(t.getUTCDate())}`;
}
