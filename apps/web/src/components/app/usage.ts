import type { UsageSummary } from "@muxaris/shared";
import { formatDate } from "./format";

/** True when an API payload has the fields the usage card reads. */
export function isUsageSummary(v: unknown): v is UsageSummary {
  const u = v as Partial<UsageSummary> | null;
  return !!u && typeof u.callSeconds === "number" && typeof u.includedCallMinutes === "number";
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
        ? `Pilot ends ${formatDate(u.pilotEndsAt, tz)}`
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
