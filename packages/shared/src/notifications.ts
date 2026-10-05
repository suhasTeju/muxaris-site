export const NOTIFICATION_KINDS = [
  "appointment_confirmed",
  "appointment_rescheduled",
  "appointment_cancelled",
  "reminder_24h",
  "reminder_2h",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_KIND_LABEL: Record<NotificationKind, string> = {
  appointment_confirmed: "Confirmation",
  appointment_rescheduled: "Rescheduled",
  appointment_cancelled: "Cancelled",
  reminder_24h: "Reminder (day before)",
  reminder_2h: "Reminder (2 hours)",
};

export const NOTIFICATION_CHANNELS = ["email", "sms", "whatsapp"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
export const NOTIFICATION_STATUSES = ["queued", "sent", "failed", "skipped"] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

/** Platform-level channel switches (env), not clinic settings. Email is always on. */
export interface ChannelFlags {
  sms: boolean;
  whatsapp: boolean;
}
const on = (v: string | undefined) => v === "1" || v?.toLowerCase() === "true";
export function channelFlagsFromEnv(src: Record<string, string | undefined>): ChannelFlags {
  return { sms: on(src["SMS_ENABLED"]), whatsapp: on(src["WHATSAPP_ENABLED"]) };
}

/** Why a notification was skipped; shown to staff in the outbox. */
export const SKIP_REASONS = {
  no_contact: "No email on file",
  channel_disabled: "Channel not enabled",
  clinic_disabled: "Turned off in Settings",
} as const;
export type SkipReason = keyof typeof SKIP_REASONS;

export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "•••";
  return `${email.slice(0, 1)}•••${email.slice(at)}`;
}
