import { pgTable, text, integer, timestamp, jsonb, pgEnum, index } from "drizzle-orm/pg-core";
import { clinics } from "./tenancy.js";

export const callChannelEnum = pgEnum("call_channel", ["browser", "phone"]);
export const callStatusEnum = pgEnum("call_status", ["in_progress", "completed", "failed"]);
export const callOutcomeEnum = pgEnum("call_outcome", [
  "booked",
  "rescheduled",
  "cancelled",
  "info",
  "callback",
  "handoff",
  "abandoned",
  "unknown",
]);
export const turnRoleEnum = pgEnum("turn_role", ["user", "assistant", "tool"]);
export const callbackStatusEnum = pgEnum("callback_status", ["open", "done"]);

export const calls = pgTable(
  "calls",
  {
    id: text("id").primaryKey(),
    clinicId: text("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    channel: callChannelEnum("channel").notNull(),
    callerPhone: text("caller_phone"),
    patientId: text("patient_id"),
    startedByUserId: text("started_by_user_id"),
    languageDetected: text("language_detected"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationS: integer("duration_s"),
    status: callStatusEnum("status").notNull().default("in_progress"),
    outcome: callOutcomeEnum("outcome"),
    recordingS3Key: text("recording_s3_key"),
    transcriptS3Key: text("transcript_s3_key"),
    summary: text("summary"),
    sentiment: text("sentiment"),
    metrics: jsonb("metrics").$type<Record<string, number>>().notNull().default({}),
  },
  (t) => [index("calls_clinic_started_idx").on(t.clinicId, t.startedAt)],
);

export const callTurns = pgTable(
  "call_turns",
  {
    id: text("id").primaryKey(),
    clinicId: text("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    callId: text("call_id")
      .notNull()
      .references(() => calls.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    role: turnRoleEnum("role").notNull(),
    text: text("text"),
    toolName: text("tool_name"),
    toolArgs: jsonb("tool_args"),
    toolResult: jsonb("tool_result"),
    latencyMs: integer("latency_ms"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("call_turns_call_seq_idx").on(t.callId, t.seq),
    index("call_turns_clinic_idx").on(t.clinicId),
  ],
);

export const callbacks = pgTable(
  "callbacks",
  {
    id: text("id").primaryKey(),
    clinicId: text("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    callId: text("call_id"),
    patientId: text("patient_id"),
    phone: text("phone").notNull(),
    reason: text("reason").notNull(),
    priority: text("priority").notNull().default("normal"),
    status: callbackStatusEnum("status").notNull().default("open"),
    assignedTo: text("assigned_to"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    doneAt: timestamp("done_at", { withTimezone: true }),
  },
  (t) => [index("callbacks_clinic_idx").on(t.clinicId)],
);

export const assistantProfiles = pgTable("assistant_profiles", {
  clinicId: text("clinic_id")
    .primaryKey()
    .references(() => clinics.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("Muxaris"),
  greeting: jsonb("greeting").$type<Record<string, string>>().notNull().default({}), // by language code
  voices: jsonb("voices").$type<Record<string, string>>().notNull().default({}), // language → sarvam speaker
  tone: text("tone").notNull().default("warm"),
  handoffNumber: text("handoff_number"),
  faq: jsonb("faq").$type<Array<{ q: string; a: string }>>().notNull().default([]),
  knowledge: text("knowledge"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
