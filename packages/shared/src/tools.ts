import { z } from "zod";

const phone = z.string().regex(/^\+91\d{10}$/, "E.164 Indian mobile, e.g. +919876543210");
const isoDateTime = z.string().datetime({ offset: true });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const toolInputSchemas = {
  get_clinic_info: z.object({}),
  find_slots: z.object({
    date: isoDate.describe("Calendar date in the clinic timezone, YYYY-MM-DD"),
    service_id: z.string().optional(),
    doctor_id: z.string().optional(),
    part_of_day: z.enum(["morning", "afternoon", "evening"]).optional(),
  }),
  book_appointment: z.object({
    patient_name: z.string().min(1),
    patient_phone: phone,
    doctor_id: z.string(),
    service_id: z.string(),
    starts_at: isoDateTime,
    notes: z.string().max(500).optional(),
  }),
  reschedule_appointment: z.object({
    appointment_id: z.string(),
    new_starts_at: isoDateTime,
  }),
  cancel_appointment: z.object({
    appointment_id: z.string(),
    reason: z.string().max(300).optional(),
  }),
  lookup_patient: z.object({ patient_phone: phone }),
  request_callback: z.object({
    patient_name: z.string().optional(),
    patient_phone: phone,
    reason: z.string().min(1).max(300),
    priority: z.enum(["normal", "urgent"]).default("normal"),
  }),
  transfer_to_staff: z.object({
    reason: z.enum([
      "emergency",
      "clinical_question",
      "billing",
      "caller_request",
      "not_understood",
    ]),
  }),
  end_call: z.object({ summary: z.string().max(300) }),
} as const;

export type ToolName = keyof typeof toolInputSchemas;
export type ToolInput<N extends ToolName> = z.infer<(typeof toolInputSchemas)[N]>;

export interface ToolDefinition {
  name: ToolName;
  description: string;
  inputSchema: Record<string, unknown> & { type: "object"; properties?: Record<string, unknown> };
}

const descriptions: Record<ToolName, string> = {
  get_clinic_info:
    "Get the clinic's address, opening hours, doctors and services. Call once at most.",
  find_slots:
    "Find available appointment slots on a date, optionally for a doctor, service or part of day. Always call before offering times.",
  book_appointment:
    "Book an appointment after the caller confirms the exact time. Requires the caller's name and 10-digit mobile number.",
  reschedule_appointment: "Move an existing appointment to a new confirmed time.",
  cancel_appointment: "Cancel an existing appointment after the caller confirms.",
  lookup_patient: "Find a patient's upcoming appointments by their mobile number.",
  request_callback: "Record that clinic staff should call the patient back, with the reason.",
  transfer_to_staff:
    "Hand the call to a human for emergencies, clinical questions, billing disputes or when the caller asks.",
  end_call: "End the call politely once the caller's needs are met. Include a one-line summary.",
};

function toInputSchema(name: ToolName): ToolDefinition["inputSchema"] {
  const schema = z.toJSONSchema(toolInputSchemas[name], { io: "input" }) as Record<string, unknown>;
  delete schema["$schema"];
  return { ...schema, type: "object" };
}

export const ASSISTANT_TOOLS: ToolDefinition[] = (Object.keys(toolInputSchemas) as ToolName[]).map(
  (name) => ({
    name,
    description: descriptions[name],
    inputSchema: toInputSchema(name),
  }),
);
