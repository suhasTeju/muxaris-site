import {
  CoreError,
  bookAppointment,
  cancelAppointment,
  createCallback,
  findAvailableSlots,
  findPatientByPhone,
  listUpcomingForPatient,
  localDateString,
  rescheduleAppointment,
} from "@muxaris/core";
import { schema, type Db } from "@muxaris/db";
import { and, eq } from "drizzle-orm";
import {
  toolInputSchemas,
  type GatewayEvent,
  type LanguageCode,
  type ToolName,
} from "@muxaris/shared";
import { addDays, formatLocal, toLocalIso } from "./local-time.js";
import { openingHours, type ClinicContext } from "./prompt.js";

export interface ToolContext {
  clinic: ClinicContext;
  callId: string;
  language: LanguageCode;
  now: () => Date;
  /** Verified caller ID (phone channel); undefined for browser calls. */
  callerPhone?: string | undefined;
  /** Phone number the caller first claimed in this call; set by executeTool. */
  claimedPhone?: string | undefined;
}

export interface ToolOutcome {
  result: unknown;
  event?: GatewayEvent;
}

const MAX_SLOTS_RETURNED = 10;
const MAX_ALTERNATIVES = 3;
const ALTERNATIVE_SEARCH_DAYS = 4;

type SlotLike = { doctorId: string; startsAt: Date };

function slotView(ctx: ToolContext, s: SlotLike) {
  const tz = ctx.clinic.clinic.timezone;
  const doc = ctx.clinic.doctors.find((d) => d.id === s.doctorId);
  return {
    doctor_id: s.doctorId,
    doctor: doc?.name ?? "",
    starts_at: toLocalIso(s.startsAt, tz),
    local: formatLocal(s.startsAt, tz),
  };
}

/** At most `n` items, evenly spread so the caller hears a range across the day. */
function spread<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items;
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(items[Math.floor((i * items.length) / n)]!);
  return out;
}

function appointmentView(
  ctx: ToolContext,
  a: { id: string; doctorId: string; serviceId: string; startsAt: Date; status: string },
) {
  const tz = ctx.clinic.clinic.timezone;
  return {
    appointment_id: a.id,
    doctor_name: ctx.clinic.doctors.find((d) => d.id === a.doctorId)?.name ?? "",
    service_name: ctx.clinic.services.find((s) => s.id === a.serviceId)?.name ?? "",
    starts_at: toLocalIso(a.startsAt, tz),
    local_time: formatLocal(a.startsAt, tz),
    status: a.status,
  };
}

function clinicInfo(ctx: ToolContext) {
  const { clinic, assistant } = ctx.clinic;
  return {
    clinic: {
      name: clinic.name,
      city: clinic.city,
      address: clinic.address,
      phone: clinic.phone,
      timezone: clinic.timezone,
    },
    hours: openingHours(ctx.clinic),
    doctors: ctx.clinic.doctors.map((d) => ({
      id: d.id,
      name: d.name,
      title: d.title,
      languages: d.languages,
      specialties: d.specialties,
    })),
    services: ctx.clinic.services.map((s) => ({
      id: s.id,
      name: s.name,
      duration_min: s.durationMin,
      price_inr: s.priceInr,
      bookable: s.bookableByAi,
    })),
    handoff_number: assistant?.handoffNumber ?? null,
  };
}

async function alternativesFor(
  db: Db,
  ctx: ToolContext,
  input: { date: string; serviceId: string; at: Date },
) {
  const clinicId = ctx.clinic.clinic.id;
  const pool: SlotLike[] = [];
  for (let i = 0; i < ALTERNATIVE_SEARCH_DAYS && pool.length < MAX_ALTERNATIVES * 2; i++) {
    const slots = await findAvailableSlots(db, {
      clinicId,
      date: addDays(input.date, i),
      serviceId: input.serviceId,
      now: ctx.now(),
      forAssistant: true,
    });
    pool.push(...slots);
  }
  pool.sort(
    (a, b) =>
      Math.abs(a.startsAt.getTime() - input.at.getTime()) -
      Math.abs(b.startsAt.getTime() - input.at.getTime()),
  );
  return pool.slice(0, MAX_ALTERNATIVES).map((s) => slotView(ctx, s));
}

export function normalizePhone(p: string): string {
  const d = p.replace(/[^\d+]/g, "");
  return /^\d{10}$/.test(d) ? `+91${d}` : d;
}

const VERIFICATION_MISMATCH: ToolOutcome = {
  result: {
    error: "verification_required",
    message: "phone does not match caller id; offer to transfer to staff",
  },
};

/** Applies the caller-id / claimed-phone binding. Returns a refusal, or undefined when allowed. */
function bindPhone(
  ctx: ToolContext,
  phone: string,
  opts: { checkClaimed: boolean },
): ToolOutcome | undefined {
  const norm = normalizePhone(phone);
  if (ctx.callerPhone && normalizePhone(ctx.callerPhone) !== norm) return VERIFICATION_MISMATCH;
  if (!ctx.claimedPhone) ctx.claimedPhone = norm;
  else if (opts.checkClaimed && ctx.claimedPhone !== norm) return VERIFICATION_MISMATCH;
  return undefined;
}

/** Loads an appointment that belongs to the phone bound to this call, else a refusal. */
async function ownedAppointment(
  db: Db,
  ctx: ToolContext,
  appointmentId: string,
): Promise<{ refusal: ToolOutcome } | { ok: true }> {
  const bound = ctx.callerPhone ?? ctx.claimedPhone;
  if (!bound) {
    return {
      refusal: {
        result: {
          error: "verification_required",
          message: "ask the caller for the mobile number used for the booking",
        },
      },
    };
  }
  const clinicId = ctx.clinic.clinic.id;
  const notFound = {
    refusal: { result: { error: "not_found", message: "appointment not found" } },
  };
  const [apt] = await db
    .select({ patientId: schema.appointments.patientId })
    .from(schema.appointments)
    .where(
      and(eq(schema.appointments.id, appointmentId), eq(schema.appointments.clinicId, clinicId)),
    );
  if (!apt) return notFound;
  const patient = await findPatientByPhone(db, clinicId, normalizePhone(bound));
  if (!patient || patient.id !== apt.patientId) return notFound;
  return { ok: true };
}

async function run(db: Db, ctx: ToolContext, name: ToolName, input: unknown): Promise<ToolOutcome> {
  const clinicId = ctx.clinic.clinic.id;
  const tz = ctx.clinic.clinic.timezone;
  switch (name) {
    case "get_clinic_info":
      return { result: clinicInfo(ctx) };

    case "find_slots": {
      const a = toolInputSchemas.find_slots.parse(input);
      if (!a.service_id) {
        return {
          result: {
            error: "service_required",
            message: "service_id is required; use an id from get_clinic_info",
          },
        };
      }
      const slots = await findAvailableSlots(db, {
        clinicId,
        date: a.date,
        serviceId: a.service_id,
        ...(a.doctor_id ? { doctorId: a.doctor_id } : {}),
        ...(a.part_of_day ? { partOfDay: a.part_of_day } : {}),
        now: ctx.now(),
        forAssistant: true,
      });
      return {
        result: {
          date: a.date,
          count: slots.length,
          slots: spread(slots, MAX_SLOTS_RETURNED).map((s) => slotView(ctx, s)),
        },
      };
    }

    case "book_appointment": {
      const a = toolInputSchemas.book_appointment.parse(input);
      const refused = bindPhone(ctx, a.patient_phone, { checkClaimed: false });
      if (refused) return refused;
      const startsAt = new Date(a.starts_at);
      const date = localDateString(startsAt, tz);
      // Guard: the model may only book a slot the engine currently reports as free.
      const open = await findAvailableSlots(db, {
        clinicId,
        date,
        serviceId: a.service_id,
        doctorId: a.doctor_id,
        now: ctx.now(),
        forAssistant: true,
      });
      const ok = open.some(
        (s) => s.doctorId === a.doctor_id && s.startsAt.getTime() === startsAt.getTime(),
      );
      if (!ok) {
        return {
          result: {
            error: "slot_unavailable",
            message: "That time is not available. Offer one of the alternatives.",
            alternatives: await alternativesFor(db, ctx, {
              date,
              serviceId: a.service_id,
              at: startsAt,
            }),
          },
        };
      }
      const apt = await bookAppointment(db, {
        clinicId,
        patient: {
          phone: a.patient_phone,
          name: a.patient_name,
          preferredLanguage: ctx.language,
        },
        doctorId: a.doctor_id,
        serviceId: a.service_id,
        startsAt,
        source: "ai_call",
        createdByCallId: ctx.callId,
        ...(a.notes ? { notes: a.notes } : {}),
      });
      const view = appointmentView(ctx, apt);
      return {
        result: { booked: true, ...view },
        event: {
          type: "booking",
          appointmentId: apt.id,
          doctorName: view.doctor_name,
          serviceName: view.service_name,
          startsAt: apt.startsAt.toISOString(),
        },
      };
    }

    case "reschedule_appointment": {
      const a = toolInputSchemas.reschedule_appointment.parse(input);
      const own = await ownedAppointment(db, ctx, a.appointment_id);
      if ("refusal" in own) return own.refusal;
      const apt = await rescheduleAppointment(db, {
        clinicId,
        appointmentId: a.appointment_id,
        newStartsAt: new Date(a.new_starts_at),
        source: "ai_call",
      });
      return { result: { rescheduled: true, ...appointmentView(ctx, apt) } };
    }

    case "cancel_appointment": {
      const a = toolInputSchemas.cancel_appointment.parse(input);
      const own = await ownedAppointment(db, ctx, a.appointment_id);
      if ("refusal" in own) return own.refusal;
      const apt = await cancelAppointment(db, {
        clinicId,
        appointmentId: a.appointment_id,
        ...(a.reason ? { reason: a.reason } : {}),
      });
      return { result: { cancelled: true, appointment_id: apt.id } };
    }

    case "lookup_patient": {
      const a = toolInputSchemas.lookup_patient.parse(input);
      const refused = bindPhone(ctx, a.patient_phone, { checkClaimed: true });
      if (refused) return refused;
      const patient = await findPatientByPhone(db, clinicId, normalizePhone(a.patient_phone));
      if (!patient) return { result: { found: false } };
      const upcoming = await listUpcomingForPatient(db, clinicId, patient.id, ctx.now());
      return {
        result: {
          found: true,
          appointments: upcoming.map((x) => {
            const v: Record<string, unknown> = { ...appointmentView(ctx, x) };
            delete v["status"];
            return v;
          }),
        },
      };
    }

    case "request_callback": {
      const a = toolInputSchemas.request_callback.parse(input);
      const patient = await findPatientByPhone(db, clinicId, a.patient_phone);
      const reason = a.patient_name ? `${a.patient_name}: ${a.reason}` : a.reason;
      const cb = await createCallback(db, {
        clinicId,
        callId: ctx.callId,
        ...(patient ? { patientId: patient.id } : {}),
        phone: a.patient_phone,
        reason,
        priority: a.priority,
      });
      return { result: { callback_requested: true, callback_id: cb.id } };
    }

    case "transfer_to_staff": {
      const a = toolInputSchemas.transfer_to_staff.parse(input);
      return {
        result: {
          transferred: true,
          reason: a.reason,
          handoff_number: ctx.clinic.assistant?.handoffNumber ?? null,
          instruction:
            "Tell the caller clinic staff will contact them shortly, and give the handoff number if present.",
        },
      };
    }

    case "end_call": {
      toolInputSchemas.end_call.parse(input);
      return { result: { ok: true } };
    }
  }
}

/**
 * Validates `input` against the tool schema and runs it against the core services for this
 * clinic. Never throws: failures come back as `{ error, message }` for the model to act on.
 */
export async function executeTool(
  db: Db,
  ctx: ToolContext,
  name: ToolName,
  input: unknown,
): Promise<ToolOutcome> {
  if (!(name in toolInputSchemas)) {
    return { result: { error: "unknown_tool", message: "no such tool" } };
  }
  try {
    return await run(db, ctx, name, input);
  } catch (e) {
    if (e instanceof CoreError) return { result: { error: e.code, message: e.message } };
    if (e instanceof Error && e.name === "ZodError") {
      const issues = (e as unknown as { issues: Array<{ path: PropertyKey[]; message: string }> })
        .issues;
      const msg = issues.map((i) => `${i.path.map(String).join(".") || "input"}: ${i.message}`);
      return { result: { error: "invalid_input", message: msg.join("; ").slice(0, 300) } };
    }
    return { result: { error: "internal", message: "tool failed" } };
  }
}

/** Short, PII-free description of a tool result for the `tool` event. */
export function summarizeResult(name: ToolName, result: unknown): string {
  const r = (result ?? {}) as Record<string, unknown>;
  if (typeof r["error"] === "string") return r["error"];
  if (name === "find_slots") return `${String(r["count"] ?? 0)} slots`;
  return "ok";
}
