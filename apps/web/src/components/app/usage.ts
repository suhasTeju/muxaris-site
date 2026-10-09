import type { UsageSummary } from "@muxaris/shared";

/** True when an API payload has the fields the usage card reads. */
export function isUsageSummary(v: unknown): v is UsageSummary {
  const u = v as Partial<UsageSummary> | null;
  return !!u && typeof u.callSeconds === "number" && typeof u.includedCallMinutes === "number";
}

/** "25 Oct 2026" in the clinic's zone (Indian clinics: Asia/Kolkata), as the design writes dates. */
function formatPlanDate(iso: string, tz = "Asia/Kolkata"): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")} ${get("month")} ${get("year")}`;
}

/**
 * Sidebar usage card values, following the design's shell script. Pass the clinic's timezone so
 * the pilot end date is that clinic's calendar day (Asia/Kolkata when it is not known).
 */
export function usageCard(u: UsageSummary, tz?: string) {
  const used = Math.ceil(u.callSeconds / 60);
  const included = u.includedCallMinutes;
  const hint =
    u.plan === "pilot"
      ? u.pilotEndsAt
        ? `Pilot ends ${formatPlanDate(u.pilotEndsAt, tz)}`
        : "Pilot plan"
      : "Standard plan";
  return {
    used,
    included,
    usedLabel: used.toLocaleString("en-IN"),
    includedLabel: included.toLocaleString("en-IN"),
    hint,
  };
}
