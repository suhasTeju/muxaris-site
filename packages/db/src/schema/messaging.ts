import { pgTable, text, timestamp, jsonb, pgEnum, index, integer } from "drizzle-orm/pg-core";
import { clinics } from "./tenancy.js";
export const notificationChannelEnum = pgEnum("notification_channel", ["email", "sms", "whatsapp"]);
export const notificationStatusEnum = pgEnum("notification_status", [
  "queued",
  "sent",
  "failed",
  "skipped",
]);
export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    clinicId: text("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    channel: notificationChannelEnum("channel").notNull(),
    to: text("to").notNull(),
    template: text("template").notNull(),
    language: text("language").notNull().default("en-IN"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: notificationStatusEnum("status").notNull().default("queued"),
    providerId: text("provider_id"),
    error: text("error"),
    appointmentId: text("appointment_id"),
    patientId: text("patient_id"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [
    index("notifications_clinic_created_idx").on(t.clinicId, t.createdAt),
    index("notifications_status_next_idx").on(t.status, t.nextAttemptAt),
    index("notifications_appointment_idx").on(t.appointmentId),
  ],
);
