import { Hono, type Context } from "hono";
import { z } from "zod";
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { schema, type Db } from "@muxaris/db";
import {
  bookAppointment,
  cancelAppointment,
  listAppointments,
  rescheduleAppointment,
  localDateString,
  atLocal,
  CoreError,
} from "@muxaris/core";
import { appointmentBody, maskPhone, rescheduleBody } from "@muxaris/shared";
import type { AppEnv } from "../deps.js";
import { requireClinic } from "../auth/middleware.js";
import { isoOffset, v } from "../validate.js";

const DAY = 86_400_000;
const MAX_RANGE_DAYS = 62;
const page = {
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
};
const listQuery = z.object({
  from: isoOffset.optional(),
  to: isoOffset.optional(),
  doctorId: z.string().min(1).optional(),
  status: z.enum(schema.appointmentStatusEnum.enumValues).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
  offset: z.coerce.number().int().min(0).default(0),
});
const cancelBody = z.object({ reason: z.string().trim().min(1).max(300).optional() });
const patientsQuery = z.object({ q: z.string().trim().min(1).max(100).optional(), ...page });

/** Adds `patient: { name, phoneMasked }` (clinic-scoped join) to appointment rows. */
async function attachPatients<T extends { patientId: string }>(
  db: Db,
  clinicId: string,
  rows: T[],
) {
  const ids = [...new Set(rows.map((r) => r.patientId))];
  const found = ids.length
    ? await db
        .select({
          id: schema.patients.id,
          name: schema.patients.name,
          phone: schema.patients.phone,
        })
        .from(schema.patients)
        .where(and(eq(schema.patients.clinicId, clinicId), inArray(schema.patients.id, ids)))
    : [];
  const byId = new Map(found.map((p) => [p.id, p]));
  return rows.map((r) => {
    const p = byId.get(r.patientId);
    return {
      ...r,
      patient: { name: p?.name ?? null, phoneMasked: p ? maskPhone(p.phone) : "" },
    };
  });
}

const ownerRequired = (c: Context<AppEnv>) =>
  c.json(
    { error: { code: "owner_required", message: "owner role required to override slot rules" } },
    403,
  );

export function appointmentRoutes(db: Db) {
  const r = new Hono<AppEnv>();
  const member = requireClinic(db);

  r.get("/appointments", member, v("query", listQuery), async (c) => {
    const q = c.req.valid("query");
    const clinicId = c.get("clinic").id;
    let from: Date;
    if (q.from) {
      from = new Date(q.from);
    } else {
      // "today" is the clinic's local day, not UTC
      const [clinic] = await db
        .select({ timezone: schema.clinics.timezone })
        .from(schema.clinics)
        .where(eq(schema.clinics.id, clinicId));
      const tz = clinic?.timezone ?? "Asia/Kolkata";
      from = atLocal(localDateString(new Date(), tz), "00:00", tz);
    }
    const to = q.to ? new Date(q.to) : new Date(from.getTime() + 7 * DAY);
    if (to <= from) throw new CoreError("validation", "`to` must be after `from`");
    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY) {
      throw new CoreError("validation", `the range may span at most ${MAX_RANGE_DAYS} days`);
    }
    const rows = await listAppointments(db, {
      clinicId,
      from,
      to,
      limit: q.limit,
      offset: q.offset,
      ...(q.doctorId ? { doctorId: q.doctorId } : {}),
      ...(q.status ? { status: q.status } : {}),
    });
    return c.json({ appointments: await attachPatients(db, clinicId, rows) });
  });

  r.post("/appointments", member, v("json", appointmentBody), async (c) => {
    const b = c.req.valid("json");
    if (b.allowOutsideRules && c.get("clinic").role !== "owner") return ownerRequired(c);
    const appointment = await bookAppointment(db, {
      clinicId: c.get("clinic").id,
      patient: {
        phone: b.patient.phone,
        ...(b.patient.name ? { name: b.patient.name } : {}),
        ...(b.patient.preferredLanguage ? { preferredLanguage: b.patient.preferredLanguage } : {}),
      },
      doctorId: b.doctorId,
      serviceId: b.serviceId,
      startsAt: new Date(b.startsAt),
      source: "dashboard",
      ...(b.notes ? { notes: b.notes } : {}),
      ...(b.allowOutsideRules ? { allowOutsideRules: true } : {}),
    });
    const [withPatient] = await attachPatients(db, c.get("clinic").id, [appointment]);
    return c.json({ appointment: withPatient }, 201);
  });

  r.patch("/appointments/:id/reschedule", member, v("json", rescheduleBody), async (c) => {
    const b = c.req.valid("json");
    if (b.allowOutsideRules && c.get("clinic").role !== "owner") return ownerRequired(c);
    const clinicId = c.get("clinic").id;
    const appointmentId = c.req.param("id");
    if (b.doctorId || b.serviceId) {
      const [cur] = await db
        .select()
        .from(schema.appointments)
        .where(
          and(
            eq(schema.appointments.id, appointmentId),
            eq(schema.appointments.clinicId, clinicId),
          ),
        );
      if (!cur) throw new CoreError("not_found", "appointment not found");
      if (
        (b.doctorId && b.doctorId !== cur.doctorId) ||
        (b.serviceId && b.serviceId !== cur.serviceId)
      ) {
        throw new CoreError(
          "validation",
          "changing doctor or service is not supported; cancel and rebook",
        );
      }
    }
    const appointment = await rescheduleAppointment(db, {
      clinicId,
      appointmentId,
      newStartsAt: new Date(b.startsAt),
      ...(b.allowOutsideRules ? { allowOutsideRules: true } : {}),
    });
    const [withPatient] = await attachPatients(db, clinicId, [appointment]);
    return c.json({ appointment: withPatient });
  });

  r.post("/appointments/:id/cancel", member, v("json", cancelBody), async (c) => {
    const appointment = await cancelAppointment(db, {
      clinicId: c.get("clinic").id,
      appointmentId: c.req.param("id"),
      ...(c.req.valid("json").reason ? { reason: c.req.valid("json").reason! } : {}),
    });
    const [withPatient] = await attachPatients(db, c.get("clinic").id, [appointment]);
    return c.json({ appointment: withPatient });
  });

  r.get("/patients", member, v("query", patientsQuery), async (c) => {
    const { q, limit, offset } = c.req.valid("query");
    const like = q ? `%${q.replace(/[\\%_]/g, "\\$&")}%` : null;
    const patients = await db
      .select()
      .from(schema.patients)
      .where(
        and(
          eq(schema.patients.clinicId, c.get("clinic").id),
          like
            ? or(ilike(schema.patients.name, like), ilike(schema.patients.phone, like))
            : undefined,
        ),
      )
      .orderBy(desc(schema.patients.createdAt), desc(schema.patients.id))
      .limit(limit)
      .offset(offset);
    return c.json({ patients });
  });

  return r;
}
