import { LANGUAGES } from "@muxaris/shared";
import { ApiError } from "@/lib/api";
import { DISPLAY_WEEKDAYS, WEEKDAY_NAMES, type WeekHours } from "@/lib/onboarding";
import { formatIndianPhone } from "@/lib/phone";

/** "kn-IN" → "Kannada" (the code itself when unknown). */
export function languageName(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

/** "kn-IN" → "ಕನ್ನಡ". */
export function languageNative(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.native ?? code;
}

/** "Asia/Kolkata" → "Asia/Kolkata (IST)", using the zone's short name where the runtime has one. */
export function timezoneLabel(tz: string): string {
  try {
    const short = new Intl.DateTimeFormat("en-IN", { timeZone: tz, timeZoneName: "short" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value;
    return short && short !== tz ? `${tz} (${short})` : tz;
  } catch {
    return tz;
  }
}

/** "+91 98765 43210" for a mobile, "+91 80 4123 4567" for a landline; see lib/phone. */
export function formatPhone(phone: string | null | undefined): string {
  return formatIndianPhone(phone);
}

/** ₹1,500 (Indian grouping). */
export function rupee(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

/** 7 entries, index 0 = Sunday, from the API's working-hours rows (first start, last end per day). */
export function weekFromHours(
  rows: Array<{ weekday: number; startTime: string; endTime: string }> | undefined,
): { week: WeekHours; split: boolean } {
  let split = false;
  const week: WeekHours = Array.from({ length: 7 }, () => ({
    open: false,
    start: "10:00",
    end: "20:00",
  }));
  for (const r of rows ?? []) {
    const d = week[r.weekday];
    if (!d) continue;
    const end = r.endTime === "24:00" ? "23:59" : r.endTime;
    if (d.open) {
      split = true;
      if (r.startTime < d.start) d.start = r.startTime;
      if (end > d.end) d.end = end;
    } else {
      week[r.weekday] = { open: true, start: r.startTime, end };
    }
  }
  return { week, split };
}

/** "Mon–Sat 10:00–20:00" when the open days run together with the same hours, else "5 days a week". */
export function hoursSummary(
  rows: Array<{ weekday: number; startTime: string; endTime: string }> | undefined,
): string {
  const { week, split } = weekFromHours(rows);
  const on = DISPLAY_WEEKDAYS.filter((d) => week[d]!.open);
  if (!on.length) return "No working hours";
  const first = week[on[0]!]!;
  const order = on.map((d) => DISPLAY_WEEKDAYS.indexOf(d));
  const same =
    !split && on.every((d) => week[d]!.start === first.start && week[d]!.end === first.end);
  const contiguous = order.every((v, k) => k === 0 || v === order[k - 1]! + 1);
  if (!same || !contiguous) return `${on.length} ${on.length === 1 ? "day" : "days"} a week`;
  const day = (d: number) => WEEKDAY_NAMES[d]!.slice(0, 3);
  const days = on.length === 1 ? day(on[0]!) : `${day(on[0]!)}–${day(on[on.length - 1]!)}`;
  return `${days} ${first.start}–${first.end}`;
}

/** A short, human message for a failed save. */
export function saveErrorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 403) return "Only the clinic owner can change this.";
    if (e.status === 400) return "Some values were not accepted. Check them and try again.";
    if (e.status === 404) return "This item no longer exists. Refresh the page.";
    return e.message || "Could not save the changes. Try again.";
  }
  return "Could not save the changes. Try again.";
}
