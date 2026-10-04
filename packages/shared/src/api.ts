import { z } from "zod";
import { BULBUL_V3_SPEAKERS, LANGUAGE_CODES } from "./languages.js";
import { CITIES, ROLES, SPECIALTIES } from "./clinic.js";

// Request-body schemas. Dates are shape-checked here; the API adds calendar checks.
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM");
const endTimeStr = z.union([timeStr, z.literal("24:00")]);
const isoDateTime = z.iso.datetime({ offset: true });
const languages = z.array(z.enum(LANGUAGE_CODES)).min(1);

/**
 * Indian mobile in common human formats (`+91 98765-43210`, `91…`, `0…`, bare 10 digits);
 * normalised to E.164 `+91XXXXXXXXXX`.
 */
export const indianPhone = z
  .string()
  .transform((v) => v.replace(/[\s\-()]/g, ""))
  .pipe(z.string().regex(/^(?:\+91|91|0)?[6-9]\d{9}$/, "Enter a valid Indian mobile number"))
  .transform((v) => `+91${v.slice(-10)}`);

export const createClinicBody = z.object({
  name: z.string().trim().min(1),
  city: z.string().trim().min(1),
  specialty: z.string().trim().min(1).optional(),
  address: z.string().trim().optional(),
  phone: indianPhone.optional(),
  languages: languages.optional(),
});

export const doctorBody = z.object({
  name: z.string().trim().min(1),
  title: z.string().trim().nullish(),
  specialties: z.array(z.string().trim().min(1)).optional(),
  languages: languages.optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  active: z.boolean().optional(),
});

export const workingHoursBody = z.object({
  hours: z
    .array(
      z
        .object({
          weekday: z.number().int().min(0).max(6),
          startTime: timeStr,
          endTime: endTimeStr,
        })
        .refine(
          (h) =>
            h.endTime === "24:00" ||
            (h.endTime === "00:00" ? h.startTime !== "00:00" : h.endTime > h.startTime),
          {
            message: "endTime must be after startTime",
            path: ["endTime"],
          },
        ),
    )
    .max(21),
});

export const serviceBody = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().nullish(),
  durationMin: z.number().int().positive(),
  bufferMin: z.number().int().nonnegative().optional(),
  priceInr: z.number().int().nonnegative().nullish(),
  bookableByAi: z.boolean().optional(),
  active: z.boolean().optional(),
});

export const slotRulesBody = z.object({
  slotGrainMin: z.number().int().min(5).max(60).optional(),
  leadTimeMin: z.number().int().min(0).max(1440).optional(),
  maxDaysAhead: z.number().int().min(1).max(365).optional(),
  allowSameDay: z.boolean().optional(),
  maxPerSlot: z.number().int().min(1).max(10).optional(),
});

export const assistantProfileBody = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  greeting: z.partialRecord(z.enum(LANGUAGE_CODES), z.string().min(1).max(300)).optional(),
  voices: z.partialRecord(z.enum(LANGUAGE_CODES), z.enum(BULBUL_V3_SPEAKERS)).optional(),
  tone: z.string().trim().min(1).max(200).optional(),
  handoffNumber: indianPhone.nullish(),
  faq: z
    .array(z.object({ q: z.string().min(1).max(200), a: z.string().min(1).max(1000) }))
    .max(30)
    .optional(),
  knowledge: z.string().max(8000).nullish(),
});

export const patientBody = z.object({
  phone: indianPhone,
  name: z.string().trim().min(1).nullish(),
  preferredLanguage: z.enum(LANGUAGE_CODES).optional(),
  dob: dateStr.nullish(),
  notes: z.string().nullish(),
});

export const appointmentBody = z.object({
  patient: z.object({
    phone: indianPhone,
    name: z.string().trim().min(1).optional(),
    preferredLanguage: z.enum(LANGUAGE_CODES).optional(),
  }),
  doctorId: z.string().min(1),
  serviceId: z.string().min(1),
  startsAt: isoDateTime,
  notes: z.string().nullish(),
});

export const rescheduleBody = z.object({
  startsAt: isoDateTime,
  doctorId: z.string().min(1).optional(),
  serviceId: z.string().min(1).optional(),
});

export const memberRoleBody = z.object({ role: z.enum(ROLES) });

export type CreateClinicBody = z.infer<typeof createClinicBody>;
export type DoctorBody = z.infer<typeof doctorBody>;
export type WorkingHoursBody = z.infer<typeof workingHoursBody>;
export type ServiceBody = z.infer<typeof serviceBody>;
export type SlotRulesBody = z.infer<typeof slotRulesBody>;
export type AssistantProfileBody = z.infer<typeof assistantProfileBody>;
export type PatientBody = z.infer<typeof patientBody>;
export type AppointmentBody = z.infer<typeof appointmentBody>;
export type RescheduleBody = z.infer<typeof rescheduleBody>;

// Response DTOs: mirror DB rows, timestamps serialised as ISO strings.
type Iso = string;

export interface Clinic {
  id: string;
  name: string;
  slug: string;
  specialty: string;
  city: string;
  address: string | null;
  phone: string | null;
  timezone: string;
  languages: string[];
  plan: "pilot" | "standard";
  settings: Record<string, unknown>;
  onboardingStep: string;
  createdAt: Iso;
  updatedAt: Iso;
}
export interface Membership {
  id: string;
  userId: string;
  clinicId: string;
  role: "owner" | "front_desk";
  status: "active" | "invited" | "removed";
  invitedBy: string | null;
  createdAt: Iso;
}
export interface Doctor {
  id: string;
  clinicId: string;
  name: string;
  title: string | null;
  specialties: string[];
  languages: string[];
  color: string;
  active: boolean;
  createdAt: Iso;
}
export interface WorkingHour {
  id: string;
  clinicId: string;
  doctorId: string;
  weekday: number;
  startTime: string;
  endTime: string;
}
export interface Service {
  id: string;
  clinicId: string;
  name: string;
  description: string | null;
  durationMin: number;
  bufferMin: number;
  priceInr: number | null;
  bookableByAi: boolean;
  active: boolean;
}
export interface SlotRules {
  clinicId: string;
  slotGrainMin: number;
  leadTimeMin: number;
  maxDaysAhead: number;
  allowSameDay: boolean;
  maxPerSlot: number;
}
export interface Patient {
  id: string;
  clinicId: string;
  phone: string;
  name: string | null;
  preferredLanguage: string;
  dob: string | null;
  notes: string | null;
  consentAt: Iso | null;
  createdAt: Iso;
}
export interface Appointment {
  id: string;
  clinicId: string;
  patientId: string;
  doctorId: string;
  serviceId: string;
  startsAt: Iso;
  endsAt: Iso;
  status: "scheduled" | "confirmed" | "rescheduled" | "cancelled" | "completed" | "no_show";
  source: "ai_call" | "dashboard" | "web";
  createdByCallId: string | null;
  notes: string | null;
  reminder24hSentAt: Iso | null;
  reminder2hSentAt: Iso | null;
  createdAt: Iso;
  updatedAt: Iso;
}
export interface Call {
  id: string;
  clinicId: string;
  channel: "browser" | "phone";
  callerPhone: string | null;
  patientId: string | null;
  startedByUserId: string | null;
  languageDetected: string | null;
  startedAt: Iso;
  endedAt: Iso | null;
  durationS: number | null;
  status: "in_progress" | "completed" | "failed";
  outcome:
    | "booked"
    | "rescheduled"
    | "cancelled"
    | "info"
    | "callback"
    | "handoff"
    | "abandoned"
    | "unknown"
    | null;
  recordingS3Key: string | null;
  transcriptS3Key: string | null;
  summary: string | null;
  sentiment: string | null;
  metrics: Record<string, number>;
}
export interface CallTurn {
  id: string;
  clinicId: string;
  callId: string;
  seq: number;
  role: "user" | "assistant" | "tool";
  text: string | null;
  toolName: string | null;
  toolArgs: unknown;
  toolResult: unknown;
  latencyMs: number | null;
  startedAt: Iso;
}
export interface AssistantProfile {
  clinicId: string;
  name: string;
  greeting: Record<string, string>;
  voices: Record<string, string>;
  tone: string;
  handoffNumber: string | null;
  faq: Array<{ q: string; a: string }>;
  knowledge: string | null;
  updatedAt: Iso;
}

/** Public marketing-site demo request (POST /v1/demo-requests, no auth). */
export const demoRequestBody = z.object({
  name: z.string().trim().min(1).max(120),
  clinic: z.string().trim().min(1).max(160),
  city: z.enum(CITIES),
  phone: indianPhone,
  email: z.string().trim().max(200).pipe(z.email()),
  specialty: z.enum(SPECIALTIES),
  language: z.enum(LANGUAGE_CODES),
  /** Honeypot: real users never fill this. */
  website: z.string().max(200).optional(),
});
export type DemoRequestBody = z.infer<typeof demoRequestBody>;
