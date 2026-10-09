import { formatDay, formatTime, localDateKey } from "@/lib/dashboard";
import { formatIndianPhone } from "@/lib/phone";

const DEFAULT_TZ = "Asia/Kolkata";

function zone(tz: string | undefined): string {
  const z = tz || DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat("en-IN", { timeZone: z });
    return z;
  } catch {
    return DEFAULT_TZ;
  }
}

/** Callbacks: "Today, 10:44 am", otherwise "Thu, 8 Oct, 4:05 pm" (the prototype's h.date + h.time). */
export function callbackWhen(iso: string, tz: string, today: string): string {
  const day = localDateKey(iso, tz) === today ? "Today" : formatDay(iso, tz);
  return `${day}, ${formatTime(iso, tz)}`;
}

/** Notifications: "9 Oct, 2:30 pm" (the prototype's h.dayShort + h.time). */
export function shortWhen(iso: string, tz: string): string {
  const day = new Intl.DateTimeFormat("en-IN", {
    timeZone: zone(tz),
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
  return `${day}, ${formatTime(iso, tz)}`;
}

/**
 * A revealed patient number the way the design prints it: mobiles "+91 97390 14821", landlines
 * "+91 11 2345 6789" (`formatIndianPhone` in @muxaris/shared). Anything else is returned unchanged.
 */
export function displayPhone(phone: string): string {
  return formatIndianPhone(phone);
}
