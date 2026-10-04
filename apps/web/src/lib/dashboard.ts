import type { Appointment, Call, Doctor } from "@muxaris/shared";

export const DEFAULT_TZ = "Asia/Kolkata";

function safeTz(tz: string | undefined): string {
  const zone = tz || DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat("en-IN", { timeZone: zone });
    return zone;
  } catch {
    return DEFAULT_TZ;
  }
}

/** "9:30 am" in the clinic timezone. */
export function formatTime(iso: string, tz?: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: safeTz(tz),
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date(iso))
    .replace(/\s?(am|pm)/i, (_, m: string) => ` ${m.toLowerCase()}`);
}

/** "Tue, 6 Oct" in the clinic timezone. */
export function formatDay(iso: string, tz?: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: safeTz(tz),
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

export function formatDateTime(iso: string, tz?: string): string {
  return `${formatDay(iso, tz)}, ${formatTime(iso, tz)}`;
}

/** "YYYY-MM-DD" of the instant in the clinic timezone. */
export function localDateKey(iso: string | Date, tz?: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTz(tz),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof iso === "string" ? new Date(iso) : iso);
  return parts;
}

function offsetMs(at: number, tz: string): number {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(new Date(at))
    .reduce<Record<string, number>>((a, x) => ({ ...a, [x.type]: Number(x.value) }), {});
  return Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!) - at;
}

/** UTC instant of 00:00 local on `dateKey` ("YYYY-MM-DD") in `tz`. */
export function startOfLocalDay(dateKey: string, tz?: string): Date {
  const zone = safeTz(tz);
  const [y, m, d] = dateKey.split("-").map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - offsetMs(guess, zone);
  t = guess - offsetMs(t, zone);
  return new Date(t);
}

export function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** ISO range [from, to) covering `days` local days beginning at `dateKey`. */
export function dayRange(dateKey: string, days: number, tz?: string) {
  return {
    from: startOfLocalDay(dateKey, tz).toISOString(),
    to: startOfLocalDay(addDays(dateKey, days), tz).toISOString(),
  };
}

/** "•••• 4321": only the last 4 digits of a phone number. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length <= 4 ? digits : `•••• ${digits.slice(-4)}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "-";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}

export interface Usage {
  month: string;
  callSeconds: number;
  calls: number;
  includedCallMinutes: number;
  plan: string;
}

export interface Kpis {
  callsToday: number;
  bookedToday: number;
  minutesUsed: number;
  minutesIncluded: number;
  /** 0..1, capped. */
  usageRatio: number;
}

export function computeKpis(input: {
  calls: Pick<Call, "startedAt" | "outcome">[];
  usage: Usage | null;
  now?: Date;
  tz?: string;
}): Kpis {
  const today = localDateKey(input.now ?? new Date(), input.tz);
  const todays = input.calls.filter((c) => localDateKey(c.startedAt, input.tz) === today);
  const minutesUsed = Math.ceil((input.usage?.callSeconds ?? 0) / 60);
  const minutesIncluded = input.usage?.includedCallMinutes ?? 0;
  return {
    callsToday: todays.length,
    bookedToday: todays.filter((c) => c.outcome === "booked").length,
    minutesUsed,
    minutesIncluded,
    usageRatio: minutesIncluded > 0 ? Math.min(1, minutesUsed / minutesIncluded) : 0,
  };
}

export interface DoctorGroup {
  doctorId: string;
  doctorName: string;
  color: string | null;
  items: Appointment[];
}

/** Groups appointments by doctor (doctor list order, unknown doctors last), each sorted by time. */
export function groupByDoctor(
  appointments: Appointment[],
  doctors: Pick<Doctor, "id" | "name" | "color">[],
): DoctorGroup[] {
  const byId = new Map<string, Appointment[]>();
  for (const a of appointments) byId.set(a.doctorId, [...(byId.get(a.doctorId) ?? []), a]);
  const byTime = (a: Appointment, b: Appointment) => a.startsAt.localeCompare(b.startsAt);
  const groups: DoctorGroup[] = [];
  for (const d of doctors) {
    const items = byId.get(d.id);
    if (items?.length) {
      groups.push({
        doctorId: d.id,
        doctorName: d.name,
        color: d.color,
        items: items.sort(byTime),
      });
      byId.delete(d.id);
    }
  }
  for (const [doctorId, items] of byId) {
    groups.push({ doctorId, doctorName: "Unassigned", color: null, items: items.sort(byTime) });
  }
  return groups;
}

export const OUTCOME_LABEL: Record<NonNullable<Call["outcome"]>, string> = {
  booked: "Booked",
  rescheduled: "Rescheduled",
  cancelled: "Cancelled",
  info: "Info",
  callback: "Callback",
  handoff: "Handoff",
  abandoned: "Abandoned",
  unknown: "Unknown",
};
