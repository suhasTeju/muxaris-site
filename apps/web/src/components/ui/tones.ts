/**
 * Status tones and badge vocabulary, copied from the TONES and BADGES maps in the design's
 * Muxaris App.dc.html script. Use `badgeFor(kind, value)` to get the label and tone for a status.
 */
export type Tone = "good" | "warn" | "bad" | "muted" | "info";

export const TONES: Record<Tone, { bg: string; fg: string; dot: string }> = {
  good: { bg: "#e7f6ec", fg: "#15803d", dot: "#16a34a" },
  warn: { bg: "#fdf1dc", fg: "#8a4b00", dot: "#d98a14" },
  bad: { bg: "#fdecef", fg: "#b4234a", dot: "#e04870" },
  muted: { bg: "#eef2f6", fg: "#4a5566", dot: "#8a95a5" },
  info: { bg: "#e3f4f3", fg: "#0b6b70", dot: "#0e9a96" },
};

export const BADGES = {
  appt: {
    scheduled: ["Scheduled", "info"],
    confirmed: ["Confirmed", "good"],
    rescheduled: ["Rescheduled", "warn"],
    cancelled: ["Cancelled", "bad"],
    completed: ["Completed", "muted"],
    no_show: ["No-show", "bad"],
  },
  outcome: {
    booked: ["Booked", "good"],
    rescheduled: ["Rescheduled", "warn"],
    cancelled: ["Cancelled", "bad"],
    info: ["Info", "info"],
    callback: ["Callback", "warn"],
    handoff: ["Handoff", "info"],
    abandoned: ["Abandoned", "muted"],
    unknown: ["Unknown", "muted"],
  },
  status: {
    completed: ["Completed", "muted"],
    in_progress: ["In progress", "info"],
    failed: ["Failed", "bad"],
    abandoned: ["Abandoned", "muted"],
  },
  notif: {
    queued: ["Queued", "info"],
    sent: ["Sent", "good"],
    failed: ["Failed", "bad"],
    skipped: ["Not sent", "muted"],
  },
  priority: { normal: ["Normal", "muted"], high: ["High", "warn"], urgent: ["Urgent", "bad"] },
  sentiment: {
    positive: ["Positive", "good"],
    neutral: ["Neutral", "muted"],
    negative: ["Negative", "bad"],
  },
  cb: { open: ["Open", "warn"], done: ["Done", "good"] },
} as const satisfies Record<string, Record<string, readonly [string, Tone]>>;

export type BadgeKind = keyof typeof BADGES;

/** Label and tone for a status value; unknown or empty values read "Not set" in muted, as in the design. */
export function badgeFor(
  kind: BadgeKind,
  value: string | null | undefined,
): { label: string; tone: Tone } {
  const table = BADGES[kind] as Record<string, readonly [string, Tone]>;
  const hit = value ? table[value] : undefined;
  return hit ? { label: hit[0], tone: hit[1] } : { label: value || "Not set", tone: "muted" };
}
