import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  time,
  date,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { clinics } from "./tenancy.js";

export const appointmentStatusEnum = pgEnum("appointment_status", [
  "scheduled",
  "confirmed",
  "rescheduled",
  "cancelled",
  "completed",
  "no_show",
]);
export const appointmentSourceEnum = pgEnum("appointment_source", ["ai_call", "dashboard", "web"]);

export const doctors = pgTable(
  "doctors",
  {
    id: text("id").primaryKey(),
    clinicId: text("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    title: text("title"), // e.g. "BDS, MDS (Orthodontics)"
    specialties: text("specialties").array().notNull().default([]),
    languages: text("languages").array().notNull().default(["en-IN"]),
    color: text("color").notNull().default("#16a34a"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("doctors_clinic_idx").on(t.clinicId)],
);

export const workingHours = pgTable(
  "working_hours",
  {
    id: text("id").primaryKey(),
    clinicId: text("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    doctorId: text("doctor_id")
      .notNull()
      .references(() => doctors.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(), // 0 = Sunday … 6 = Saturday
    startTime: time("start_time").notNull(), // "10:00"
    endTime: time("end_time").notNull(),
  },
  (t) => [index("working_hours_doctor_idx").on(t.doctorId)],
);

export const timeOff = pgTable("time_off", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id")
    .notNull()
    .references(() => clinics.id, { onDelete: "cascade" }),
  doctorId: text("doctor_id")
    .notNull()
    .references(() => doctors.id, { onDelete: "cascade" }),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  reason: text("reason"),
});

export const clinicHolidays = pgTable("clinic_holidays", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id")
    .notNull()
    .references(() => clinics.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  name: text("name").notNull(),
});

export const services = pgTable(
  "services",
  {
    id: text("id").primaryKey(),
    clinicId: text("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    durationMin: integer("duration_min").notNull(),
    bufferMin: integer("buffer_min").notNull().default(0),
    priceInr: integer("price_inr"),
    bookableByAi: boolean("bookable_by_ai").notNull().default(true),
    active: boolean("active").notNull().default(true),
  },
  (t) => [index("services_clinic_idx").on(t.clinicId)],
);

export const slotRules = pgTable("slot_rules", {
  clinicId: text("clinic_id")
    .primaryKey()
    .references(() => clinics.id, { onDelete: "cascade" }),
  slotGrainMin: integer("slot_grain_min").notNull().default(15),
  leadTimeMin: integer("lead_time_min").notNull().default(60),
  maxDaysAhead: integer("max_days_ahead").notNull().default(30),
  allowSameDay: boolean("allow_same_day").notNull().default(true),
  maxPerSlot: integer("max_per_slot").notNull().default(1),
});

export const appointments = pgTable(
  "appointments",
  {
    id: text("id").primaryKey(),
    clinicId: text("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    patientId: text("patient_id").notNull(),
    doctorId: text("doctor_id")
      .notNull()
      .references(() => doctors.id),
    serviceId: text("service_id")
      .notNull()
      .references(() => services.id),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: appointmentStatusEnum("status").notNull().default("scheduled"),
    source: appointmentSourceEnum("source").notNull().default("dashboard"),
    createdByCallId: text("created_by_call_id"),
    notes: text("notes"),
    reminder24hSentAt: timestamp("reminder_24h_sent_at", { withTimezone: true }),
    reminder2hSentAt: timestamp("reminder_2h_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("appointments_clinic_start_idx").on(t.clinicId, t.startsAt),
    index("appointments_doctor_start_idx").on(t.doctorId, t.startsAt),
    index("appointments_patient_idx").on(t.patientId),
  ],
);
