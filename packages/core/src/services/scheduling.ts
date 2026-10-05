import { addMinutes } from "date-fns";
import { and, asc, eq, gt, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { schema, newId, type Db } from "@muxaris/db";
import type { ChannelFlags } from "@muxaris/shared";
import { queueAppointmentNotification } from "../notifications/outbox.js";
import {
  findSlots,
  localDateString,
  type FindSlotsInput,
  type Slot,
} from "../scheduling/slot-engine.js";
import { assertDateString, assertTimeString, atLocal } from "../scheduling/time.js";
import type { DbLike } from "./db-types.js";
import { CoreError, slotUnavailable, type SlotUnavailableReason } from "./errors.js";
import { upsertPatientByPhone } from "./patients.js";

const {
  clinics,
  doctors,
  workingHours,
  timeOff,
  clinicHolidays,
  services,
  slotRules,
  appointments,
  auditLog,
} = schema;

export type Appointment = typeof appointments.$inferSelect;
type AppointmentStatus = Appointment["status"];
const ACTIVE: AppointmentStatus[] = ["scheduled", "confirmed", "rescheduled"];

const hhmm = (t: string) => t.slice(0, 5);

// ---------- doctors ----------

export async function listDoctors(db: Db, clinicId: string) {
  return db
    .select()
    .from(doctors)
    .where(eq(doctors.clinicId, clinicId))
    .orderBy(asc(doctors.createdAt), asc(doctors.id));
}

export interface DoctorInput {
  name: string;
  title?: string;
  specialties?: string[];
  languages?: string[];
  color?: string;
  active?: boolean;
}

export async function createDoctor(db: Db, clinicId: string, input: DoctorInput) {
  const name = input.name?.trim();
  if (!name) throw new CoreError("validation", "doctor name is required");
  const [row] = await db
    .insert(doctors)
    .values({
      id: newId("doc"),
      clinicId,
      name,
      title: input.title ?? null,
      ...(input.specialties ? { specialties: input.specialties } : {}),
      ...(input.languages ? { languages: input.languages } : {}),
      ...(input.color ? { color: input.color } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    })
    .returning();
  return row!;
}

export interface WorkingHoursInput {
  weekday: number;
  startTime: string;
  endTime: string;
}

/** Replaces all working hours of the doctor. */
export async function setWorkingHours(
  db: Db,
  clinicId: string,
  doctorId: string,
  hours: WorkingHoursInput[],
) {
  for (const h of hours) {
    if (!Number.isInteger(h.weekday) || h.weekday < 0 || h.weekday > 6) {
      throw new CoreError("validation", `weekday must be 0-6, got ${h.weekday}`);
    }
    try {
      assertTimeString(h.startTime);
      assertTimeString(h.endTime, true);
    } catch (e) {
      if (e instanceof RangeError) throw new CoreError("validation", e.message);
      throw e;
    }
    // Mirrors the shared schema: an end of 00:00/24:00 means end of day (00:00-00:00 is empty).
    const endsAtMidnight =
      h.endTime === "24:00" || (h.endTime === "00:00" && h.startTime !== "00:00");
    if (!endsAtMidnight && h.endTime <= h.startTime) {
      throw new CoreError("validation", "working hours end must be after start");
    }
  }
  return db.transaction(async (tx) => {
    const [doc] = await tx
      .select({ id: doctors.id })
      .from(doctors)
      .where(and(eq(doctors.id, doctorId), eq(doctors.clinicId, clinicId)))
      .for("update");
    if (!doc) throw new CoreError("not_found", "doctor not found");
    await tx
      .delete(workingHours)
      .where(and(eq(workingHours.doctorId, doctorId), eq(workingHours.clinicId, clinicId)));
    if (hours.length === 0) return [];
    return tx
      .insert(workingHours)
      .values(
        hours.map((h) => ({
          id: newId("wh"),
          clinicId,
          doctorId,
          weekday: h.weekday,
          startTime: h.startTime,
          // the DB constraint needs end > start, so an end of 00:00 is stored as 24:00
          endTime: h.endTime === "00:00" ? "24:00" : h.endTime,
        })),
      )
      .returning();
  });
}

// ---------- services ----------

export async function listServices(db: Db, clinicId: string) {
  return db
    .select()
    .from(services)
    .where(eq(services.clinicId, clinicId))
    .orderBy(asc(services.id));
}

export interface ServiceInput {
  name: string;
  description?: string;
  durationMin: number;
  bufferMin?: number;
  priceInr?: number;
  bookableByAi?: boolean;
  active?: boolean;
}

export async function createService(db: Db, clinicId: string, input: ServiceInput) {
  const name = input.name?.trim();
  if (!name) throw new CoreError("validation", "service name is required");
  if (!Number.isInteger(input.durationMin) || input.durationMin <= 0) {
    throw new CoreError("validation", "durationMin must be a positive integer");
  }
  if (
    input.bufferMin !== undefined &&
    (!Number.isInteger(input.bufferMin) || input.bufferMin < 0)
  ) {
    throw new CoreError("validation", "bufferMin must be an integer >= 0");
  }
  const [row] = await db
    .insert(services)
    .values({
      id: newId("svc"),
      clinicId,
      name,
      description: input.description ?? null,
      durationMin: input.durationMin,
      ...(input.bufferMin !== undefined ? { bufferMin: input.bufferMin } : {}),
      priceInr: input.priceInr ?? null,
      ...(input.bookableByAi !== undefined ? { bookableByAi: input.bookableByAi } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    })
    .returning();
  return row!;
}

// ---------- slot rules ----------

export type SlotRulesRow = typeof slotRules.$inferSelect;

export async function getSlotRules(db: DbLike, clinicId: string): Promise<SlotRulesRow> {
  const [row] = await db.select().from(slotRules).where(eq(slotRules.clinicId, clinicId));
  if (!row) throw new CoreError("not_found", "slot rules not found");
  return row;
}

const SLOT_RULE_FIELDS = [
  "slotGrainMin",
  "leadTimeMin",
  "maxDaysAhead",
  "allowSameDay",
  "maxPerSlot",
] as const;

export async function updateSlotRules(
  db: Db,
  clinicId: string,
  patch: Partial<Omit<SlotRulesRow, "clinicId">>,
) {
  const clean: Partial<Pick<SlotRulesRow, (typeof SLOT_RULE_FIELDS)[number]>> = {};
  for (const k of SLOT_RULE_FIELDS) {
    const v = patch[k];
    if (v !== undefined) (clean as Record<string, unknown>)[k] = v;
  }
  for (const k of ["slotGrainMin", "maxPerSlot"] as const) {
    const v = clean[k];
    if (v !== undefined && (!Number.isInteger(v) || (v as number) < 1)) {
      throw new CoreError("validation", `${k} must be an integer >= 1`);
    }
  }
  for (const k of ["leadTimeMin", "maxDaysAhead"] as const) {
    const v = clean[k];
    if (v !== undefined && (!Number.isInteger(v) || (v as number) < 0)) {
      throw new CoreError("validation", `${k} must be an integer >= 0`);
    }
  }
  const [clinic] = await db
    .select({ id: clinics.id })
    .from(clinics)
    .where(eq(clinics.id, clinicId));
  if (!clinic) throw new CoreError("not_found", "clinic not found");
  const [row] = await db
    .insert(slotRules)
    .values({ ...clean, clinicId })
    .onConflictDoUpdate({
      target: slotRules.clinicId,
      // never includes clinicId; a no-op assignment keeps RETURNING working for empty patches
      set: Object.keys(clean).length ? clean : { maxPerSlot: sql`${slotRules.maxPerSlot}` },
    })
    .returning();
  return row!;
}

// ---------- availability ----------

export async function findAvailableSlots(
  db: Db,
  input: {
    clinicId: string;
    date: string;
    serviceId: string;
    doctorId?: string;
    partOfDay?: "morning" | "afternoon" | "evening";
    now?: Date;
    /** Also require the service to be bookable by the AI assistant. */
    forAssistant?: boolean;
  },
): Promise<Slot[]> {
  const { clinicId, date } = input;
  try {
    assertDateString(date);
  } catch (e) {
    if (e instanceof RangeError) throw new CoreError("validation", e.message);
    throw e;
  }
  const [clinic] = await db.select().from(clinics).where(eq(clinics.id, clinicId));
  if (!clinic) throw new CoreError("not_found", "clinic not found");
  const service = await getClinicService(db, clinicId, input.serviceId, {
    forAssistant: input.forAssistant ?? false,
  });
  const rules = await getSlotRules(db, clinicId);

  const docRows = await db
    .select()
    .from(doctors)
    .where(
      and(
        eq(doctors.clinicId, clinicId),
        eq(doctors.active, true),
        ...(input.doctorId ? [eq(doctors.id, input.doctorId)] : []),
      ),
    );
  if (input.doctorId && docRows.length === 0) throw new CoreError("not_found", "doctor not found");
  const doctorIds = docRows.map((d) => d.id);
  if (doctorIds.length === 0) return [];

  const dayStart = atLocal(date, "00:00", clinic.timezone);
  const dayEnd = atLocal(date, "00:00", clinic.timezone, 1);
  const hoursRows = await db
    .select()
    .from(workingHours)
    .where(and(eq(workingHours.clinicId, clinicId), inArray(workingHours.doctorId, doctorIds)));
  const offRows = await db
    .select()
    .from(timeOff)
    .where(
      and(
        eq(timeOff.clinicId, clinicId),
        inArray(timeOff.doctorId, doctorIds),
        lt(timeOff.startsAt, addMinutes(dayEnd, 24 * 60)),
        gt(timeOff.endsAt, addMinutes(dayStart, -24 * 60)),
      ),
    );
  const holidayRows = await db
    .select({ date: clinicHolidays.date })
    .from(clinicHolidays)
    .where(eq(clinicHolidays.clinicId, clinicId));
  // Existing appointments (a day of margin either side covers any buffer and midnight spill).
  const apptRows = await db
    .select({
      doctorId: appointments.doctorId,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      bufferMin: services.bufferMin,
    })
    .from(appointments)
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .where(
      and(
        eq(appointments.clinicId, clinicId),
        inArray(appointments.doctorId, doctorIds),
        inArray(appointments.status, ACTIVE),
        lt(appointments.startsAt, addMinutes(dayEnd, 24 * 60)),
        gt(appointments.endsAt, addMinutes(dayStart, -24 * 60)),
      ),
    );

  return findSlots({
    date,
    timezone: clinic.timezone,
    now: input.now ?? new Date(),
    rules,
    doctors: docRows.map((d) => ({
      doctorId: d.id,
      workingHours: hoursRows
        .filter((h) => h.doctorId === d.id)
        .map((h) => ({
          weekday: h.weekday,
          startTime: hhmm(h.startTime),
          endTime: hhmm(h.endTime),
        })),
      timeOff: offRows
        .filter((o) => o.doctorId === d.id)
        .map((o) => ({ startsAt: o.startsAt, endsAt: o.endsAt })),
    })),
    service: {
      serviceId: service.id,
      durationMin: service.durationMin,
      bufferMin: service.bufferMin,
    },
    holidays: holidayRows.map((h) => h.date),
    appointments: apptRows.map((a) => ({
      doctorId: a.doctorId,
      startsAt: a.startsAt,
      endsAt: addMinutes(a.endsAt, a.bufferMin),
    })),
    ...(input.partOfDay ? { partOfDay: input.partOfDay } : {}),
  });
}

// ---------- booking ----------

/** Locks the doctor row (tenant check + per-doctor serialisation). Must be first in the tx. */
async function lockDoctor(
  tx: DbLike,
  clinicId: string,
  doctorId: string,
  opts: { requireActive: boolean },
) {
  const rows = await tx
    .select({ id: doctors.id })
    .from(doctors)
    .where(
      and(
        eq(doctors.id, doctorId),
        eq(doctors.clinicId, clinicId),
        ...(opts.requireActive ? [eq(doctors.active, true)] : []),
      ),
    )
    .for("update");
  if (rows.length === 0) throw new CoreError("not_found", "doctor not found");
}

/** Throws conflict if the slot overlaps another appointment or exceeds maxPerSlot. */
async function assertSlotFree(
  tx: DbLike,
  p: {
    clinicId: string;
    doctorId: string;
    startsAt: Date;
    endsAt: Date;
    bufferMin: number;
    excludeId?: string;
  },
) {
  const notSelf = p.excludeId ? [ne(appointments.id, p.excludeId)] : [];
  const blockedUntil = addMinutes(p.endsAt, p.bufferMin);
  const overlapping = await tx
    .select({ id: appointments.id })
    .from(appointments)
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .where(
      and(
        eq(appointments.clinicId, p.clinicId),
        eq(appointments.doctorId, p.doctorId),
        inArray(appointments.status, ACTIVE),
        ...notSelf,
        lt(appointments.startsAt, blockedUntil),
        // the existing appointment blocks its own buffer too
        sql`${appointments.endsAt} + ${services.bufferMin} * interval '1 minute' > ${p.startsAt.toISOString()}::timestamptz`,
      ),
    )
    .limit(1);
  if (overlapping.length > 0) throw slotUnavailable("conflict", "that time is no longer available");

  const [rules] = await tx
    .select({ maxPerSlot: slotRules.maxPerSlot })
    .from(slotRules)
    .where(eq(slotRules.clinicId, p.clinicId));
  const maxPerSlot = rules?.maxPerSlot ?? 1;
  const [{ n } = { n: 0 }] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(appointments)
    .where(
      and(
        eq(appointments.clinicId, p.clinicId),
        eq(appointments.doctorId, p.doctorId),
        inArray(appointments.status, ACTIVE),
        ...notSelf,
        eq(appointments.startsAt, p.startsAt),
      ),
    );
  if (n >= maxPerSlot) throw slotUnavailable("full", "that time is fully booked");
}

/**
 * Verifies `startsAt` is a slot the engine would offer for this doctor/service (hours, time off,
 * holidays, lead time, horizon, grain), reusing findSlots. Existing appointments are checked
 * separately by assertSlotFree. `allowOutsideRules` bypasses hours, lead time and grain only.
 */
async function assertBookable(
  tx: DbLike,
  p: {
    clinicId: string;
    doctorId: string;
    service: { id: string; durationMin: number; bufferMin: number };
    startsAt: Date;
    now: Date;
    allowOutsideRules: boolean;
  },
) {
  const [clinic] = await tx.select().from(clinics).where(eq(clinics.id, p.clinicId));
  if (!clinic) throw new CoreError("not_found", "clinic not found");
  const rules = await getSlotRules(tx, p.clinicId);
  const tz = clinic.timezone;
  const t = p.startsAt;
  if (t < p.now) throw slotUnavailable("past", "that time is in the past");
  if (t.getTime() % 60_000 !== 0) {
    throw slotUnavailable("not_on_grain", "start time must be on a whole minute");
  }
  const date = localDateString(t, tz);
  const dayStart = atLocal(date, "00:00", tz);
  const dayEnd = atLocal(date, "00:00", tz, 1);
  const hoursRows = await tx
    .select()
    .from(workingHours)
    .where(and(eq(workingHours.clinicId, p.clinicId), eq(workingHours.doctorId, p.doctorId)));
  const offRows = await tx
    .select()
    .from(timeOff)
    .where(
      and(
        eq(timeOff.clinicId, p.clinicId),
        eq(timeOff.doctorId, p.doctorId),
        lt(timeOff.startsAt, dayEnd),
        gt(timeOff.endsAt, dayStart),
      ),
    );
  const holidayRows = await tx
    .select({ date: clinicHolidays.date })
    .from(clinicHolidays)
    .where(eq(clinicHolidays.clinicId, p.clinicId));

  const realHours = hoursRows.map((h) => ({
    weekday: h.weekday,
    startTime: hhmm(h.startTime),
    endTime: hhmm(h.endTime),
  }));
  const wholeDay = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    startTime: "00:00",
    endTime: "24:00",
  }));
  const bypass = p.allowOutsideRules;
  const holidays = holidayRows.map((h) => h.date);
  const accepts = (o: {
    hours: boolean;
    grain: boolean;
    holidays: boolean;
    off: boolean;
    horizon: boolean;
    sameDay: boolean;
    lead: boolean;
  }) => {
    const input: FindSlotsInput = {
      date,
      timezone: tz,
      now: p.now,
      rules: {
        slotGrainMin: o.grain && !bypass ? rules.slotGrainMin : 1,
        leadTimeMin: o.lead && !bypass ? rules.leadTimeMin : 0,
        maxDaysAhead: o.horizon ? rules.maxDaysAhead : 1_000_000,
        allowSameDay: o.sameDay && !bypass ? rules.allowSameDay : true,
        maxPerSlot: rules.maxPerSlot,
      },
      doctors: [
        {
          doctorId: p.doctorId,
          workingHours: bypass ? wholeDay : realHours,
          timeOff: o.off ? offRows.map((x) => ({ startsAt: x.startsAt, endsAt: x.endsAt })) : [],
        },
      ],
      service: {
        serviceId: p.service.id,
        durationMin: p.service.durationMin,
        bufferMin: p.service.bufferMin,
      },
      holidays: o.holidays ? holidays : [],
      appointments: [],
    };
    return findSlots(input).some((s) => s.startsAt.getTime() === t.getTime());
  };
  const all = {
    hours: true,
    grain: true,
    holidays: true,
    off: true,
    horizon: true,
    sameDay: true,
    lead: true,
  };
  if (accepts(all)) return;
  // Add rules one at a time; the first stage that rejects names the reason.
  const none = {
    hours: true,
    grain: false,
    holidays: false,
    off: false,
    horizon: false,
    sameDay: false,
    lead: false,
  };
  const stages: Array<[SlotUnavailableReason, string, Partial<typeof all>]> = [
    ["outside_hours", "that time is outside the doctor's working hours", {}],
    ["not_on_grain", "that start time does not fall on the appointment grid", { grain: true }],
    ["holiday", "the clinic is closed that day", { grain: true, holidays: true }],
    [
      "time_off",
      "the doctor is unavailable at that time",
      { grain: true, holidays: true, off: true },
    ],
    [
      "too_far_ahead",
      "that date is too far ahead to book",
      { grain: true, holidays: true, off: true, horizon: true },
    ],
    [
      "lead_time",
      "that time is too soon to book",
      { grain: true, holidays: true, off: true, horizon: true, sameDay: true },
    ],
  ];
  for (const [reason, message, add] of stages) {
    if (!accepts({ ...none, ...add })) throw slotUnavailable(reason, message);
  }
  // Remaining difference is the lead time itself.
  throw slotUnavailable("lead_time", "that time is too soon to book");
}

async function getClinicService(
  tx: DbLike,
  clinicId: string,
  serviceId: string,
  opts: { forAssistant?: boolean; allowInactive?: boolean } = {},
) {
  const [svc] = await tx
    .select()
    .from(services)
    .where(
      and(
        eq(services.id, serviceId),
        eq(services.clinicId, clinicId),
        ...(opts.allowInactive ? [] : [eq(services.active, true)]),
      ),
    );
  if (!svc) throw new CoreError("not_found", "service not found");
  if (opts.forAssistant && !svc.bookableByAi) {
    throw new CoreError("forbidden", "service not bookable by assistant");
  }
  return svc;
}

function assertValidDate(d: Date, label: string) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
    throw new CoreError("validation", `${label} is not a valid date`);
  }
}

export async function bookAppointment(
  db: Db,
  input: {
    clinicId: string;
    patient: { phone: string; name?: string; preferredLanguage?: string };
    doctorId: string;
    serviceId: string;
    startsAt: Date;
    source: Appointment["source"];
    createdByCallId?: string;
    notes?: string;
    /** Explicit staff opt-in: bypass working hours, lead time and grain (never overlaps). */
    allowOutsideRules?: boolean;
    now?: Date;
    /** When set, an outbox row for this change is written in the same transaction. */
    notify?: ChannelFlags;
  },
): Promise<Appointment> {
  assertValidDate(input.startsAt, "startsAt");
  return db.transaction(async (tx) => {
    await lockDoctor(tx, input.clinicId, input.doctorId, { requireActive: true });
    const svc = await getClinicService(tx, input.clinicId, input.serviceId, {
      forAssistant: input.source === "ai_call",
    });
    await assertBookable(tx, {
      clinicId: input.clinicId,
      doctorId: input.doctorId,
      service: svc,
      startsAt: input.startsAt,
      now: input.now ?? new Date(),
      allowOutsideRules: input.allowOutsideRules ?? false,
    });
    const endsAt = addMinutes(input.startsAt, svc.durationMin);
    const patient = await upsertPatientByPhone(tx, input.clinicId, input.patient);
    await assertSlotFree(tx, {
      clinicId: input.clinicId,
      doctorId: input.doctorId,
      startsAt: input.startsAt,
      endsAt,
      bufferMin: svc.bufferMin,
    });
    const [row] = await tx
      .insert(appointments)
      .values({
        id: newId("apt"),
        clinicId: input.clinicId,
        patientId: patient.id,
        doctorId: input.doctorId,
        serviceId: input.serviceId,
        startsAt: input.startsAt,
        endsAt,
        source: input.source,
        createdByCallId: input.createdByCallId ?? null,
        notes: input.notes ?? null,
      })
      .returning();
    if (input.notify)
      await queueAppointmentNotification(tx, {
        clinicId: input.clinicId,
        appointmentId: row!.id,
        kind: "appointment_confirmed",
        channels: input.notify,
      });
    return row!;
  });
}

export async function rescheduleAppointment(
  db: Db,
  input: {
    clinicId: string;
    appointmentId: string;
    newStartsAt: Date;
    /** Pass "ai_call" when the assistant is acting; enforces bookableByAi. */
    source?: Appointment["source"];
    /** Explicit staff opt-in: bypass working hours, lead time and grain (never overlaps). */
    allowOutsideRules?: boolean;
    now?: Date;
    /** When set, an outbox row for this change is written in the same transaction. */
    notify?: ChannelFlags;
  },
): Promise<Appointment> {
  assertValidDate(input.newStartsAt, "newStartsAt");
  return db.transaction(async (tx) => {
    const find = () =>
      tx
        .select()
        .from(appointments)
        .where(
          and(eq(appointments.id, input.appointmentId), eq(appointments.clinicId, input.clinicId)),
        );
    const [pre] = await find();
    if (!pre) throw new CoreError("not_found", "appointment not found");
    await lockDoctor(tx, input.clinicId, pre.doctorId, { requireActive: true });
    const [apt] = await find(); // re-read under the lock
    if (!apt) throw new CoreError("not_found", "appointment not found");
    if (!ACTIVE.includes(apt.status)) {
      throw new CoreError("conflict", `cannot reschedule a ${apt.status} appointment`);
    }
    const svc = await getClinicService(tx, input.clinicId, apt.serviceId, {
      forAssistant: input.source === "ai_call",
      allowInactive: true, // an already-booked service may have been retired since
    });
    await assertBookable(tx, {
      clinicId: input.clinicId,
      doctorId: apt.doctorId,
      service: svc,
      startsAt: input.newStartsAt,
      now: input.now ?? new Date(),
      allowOutsideRules: input.allowOutsideRules ?? false,
    });
    const endsAt = addMinutes(input.newStartsAt, svc.durationMin);
    await assertSlotFree(tx, {
      clinicId: input.clinicId,
      doctorId: apt.doctorId,
      startsAt: input.newStartsAt,
      endsAt,
      bufferMin: svc.bufferMin,
      excludeId: apt.id,
    });
    const [row] = await tx
      .update(appointments)
      .set({
        startsAt: input.newStartsAt,
        endsAt,
        status: "rescheduled",
        reminder24hSentAt: null,
        reminder2hSentAt: null,
      })
      .where(
        and(
          eq(appointments.id, apt.id),
          eq(appointments.clinicId, input.clinicId),
          inArray(appointments.status, ACTIVE),
        ),
      )
      .returning();
    if (!row) throw new CoreError("conflict", "appointment already finalised");
    if (input.notify)
      await queueAppointmentNotification(tx, {
        clinicId: input.clinicId,
        appointmentId: row.id,
        kind: "appointment_rescheduled",
        channels: input.notify,
      });
    return row;
  });
}

/** Cancelling a completed/no_show appointment is a conflict; cancelling a cancelled one is a no-op. */
export async function cancelAppointment(
  db: Db,
  input: {
    clinicId: string;
    appointmentId: string;
    reason?: string;
    /** When set, an outbox row for this change is written in the same transaction. */
    notify?: ChannelFlags;
  },
): Promise<Appointment> {
  return db.transaction(async (tx) => {
    const find = () =>
      tx
        .select()
        .from(appointments)
        .where(
          and(eq(appointments.id, input.appointmentId), eq(appointments.clinicId, input.clinicId)),
        );
    const [pre] = await find();
    if (!pre) throw new CoreError("not_found", "appointment not found");
    await lockDoctor(tx, input.clinicId, pre.doctorId, { requireActive: false });
    const [apt] = await find(); // re-read under the lock
    if (!apt) throw new CoreError("not_found", "appointment not found");
    if (apt.status === "cancelled") return apt;
    if (!ACTIVE.includes(apt.status)) {
      throw new CoreError("conflict", `cannot cancel a ${apt.status} appointment`);
    }
    const notes = input.reason
      ? [apt.notes, `Cancelled: ${input.reason}`].filter(Boolean).join("\n")
      : apt.notes;
    const [row] = await tx
      .update(appointments)
      .set({ status: "cancelled", notes })
      .where(
        and(
          eq(appointments.id, apt.id),
          eq(appointments.clinicId, input.clinicId),
          inArray(appointments.status, ACTIVE),
        ),
      )
      .returning();
    if (!row) throw new CoreError("conflict", "appointment already finalised");
    if (input.notify)
      await queueAppointmentNotification(tx, {
        clinicId: input.clinicId,
        appointmentId: row.id,
        kind: "appointment_cancelled",
        channels: input.notify,
      });
    return row;
  });
}

export async function listAppointments(
  db: Db,
  input: {
    clinicId: string;
    from: Date;
    to: Date;
    doctorId?: string;
    status?: AppointmentStatus;
    limit?: number;
    offset?: number;
  },
) {
  return db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.clinicId, input.clinicId),
        gte(appointments.startsAt, input.from),
        lt(appointments.startsAt, input.to),
        ...(input.doctorId ? [eq(appointments.doctorId, input.doctorId)] : []),
        ...(input.status ? [eq(appointments.status, input.status)] : []),
      ),
    )
    .orderBy(asc(appointments.startsAt), asc(appointments.id))
    .limit(input.limit ?? 5000)
    .offset(input.offset ?? 0);
}

/** Staff marks a past appointment completed or no-show. Audited; never for future or finalised rows. */
export async function setAppointmentOutcome(
  db: Db,
  input: {
    clinicId: string;
    appointmentId: string;
    status: "completed" | "no_show";
    actorUserId: string;
    now?: Date;
  },
): Promise<Appointment> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [apt] = await tx
      .select()
      .from(appointments)
      .where(
        and(eq(appointments.id, input.appointmentId), eq(appointments.clinicId, input.clinicId)),
      )
      .for("update");
    if (!apt) throw new CoreError("not_found", "appointment not found");
    if (!ACTIVE.includes(apt.status))
      throw new CoreError("conflict", `cannot change a ${apt.status} appointment`);
    if (apt.startsAt.getTime() > now.getTime())
      throw new CoreError("conflict", "appointment has not started yet");
    const [row] = await tx
      .update(appointments)
      .set({ status: input.status })
      .where(eq(appointments.id, apt.id))
      .returning();
    await tx.insert(auditLog).values({
      id: newId("aud"),
      clinicId: input.clinicId,
      actorId: input.actorUserId,
      action: "appointment.status.edit",
      entity: "appointment",
      entityId: apt.id,
      data: { from: apt.status, to: input.status },
    });
    return row!;
  });
}
