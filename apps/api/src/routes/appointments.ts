import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { schema, type Db } from "@muxaris/db";
import {
  bookAppointment,
  cancelAppointment,
  listAppointments,
  rescheduleAppointment,
  CoreError,
} from "@muxaris/core";
import { appointmentBody, rescheduleBody } from "@muxaris/shared";
import type { AppEnv } from "../deps.js";
import { requireClinic } from "../auth/middleware.js";
import { isoOffset, v } from "../validate.js";

const DAY = 86_400_000;
const listQuery = z.object({
  from: isoOffset.optional(),
  to: isoOffset.optional(),
  doctorId: z.string().min(1).optional(),
  status: z.enum(schema.appointmentStatusEnum.enumValues).optional(),
});
const cancelBody = z.object({ reason: z.string().trim().min(1).max(500).optional() });
const patientsQuery = z.object({ q: z.string().trim().min(1).max(100).optional() });
const callsQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).optional() });

export function appointmentRoutes(db: Db) {
  const r = new Hono<AppEnv>();
  const member = requireClinic(db);

  r.get("/appointments", member, v("query", listQuery), async (c) => {
    const q = c.req.valid("query");
    const from = q.from ? new Date(q.from) : new Date(Date.now() - DAY);
    const to = q.to ? new Date(q.to) : new Date(from.getTime() + 31 * DAY);
    const appointments = await listAppointments(db, {
      clinicId: c.get("clinic").id,
      from,
      to,
      ...(q.doctorId ? { doctorId: q.doctorId } : {}),
      ...(q.status ? { status: q.status } : {}),
    });
    return c.json({ appointments });
  });

  r.post("/appointments", member, v("json", appointmentBody), async (c) => {
    const b = c.req.valid("json");
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
    });
    return c.json({ appointment }, 201);
  });

  r.patch("/appointments/:id/reschedule", member, v("json", rescheduleBody), async (c) => {
    const b = c.req.valid("json");
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
    });
    return c.json({ appointment });
  });

  r.post("/appointments/:id/cancel", member, async (c) => {
    const raw = await c.req.json().catch(() => ({}));
    const parsed = cancelBody.safeParse(raw ?? {});
    if (!parsed.success) {
      return c.json({ error: { code: "validation", issues: parsed.error.issues } }, 400);
    }
    const appointment = await cancelAppointment(db, {
      clinicId: c.get("clinic").id,
      appointmentId: c.req.param("id"),
      ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
    });
    return c.json({ appointment });
  });

  r.get("/patients", member, v("query", patientsQuery), async (c) => {
    const { q } = c.req.valid("query");
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
      .orderBy(desc(schema.patients.createdAt))
      .limit(200);
    return c.json({ patients });
  });

  r.get("/calls", member, v("query", callsQuery), async (c) => {
    const calls = await db
      .select()
      .from(schema.calls)
      .where(eq(schema.calls.clinicId, c.get("clinic").id))
      .orderBy(desc(schema.calls.startedAt))
      .limit(c.req.valid("query").limit ?? 50);
    return c.json({ calls });
  });
  r.get("/calls/:id", member, async (c) => {
    const clinicId = c.get("clinic").id;
    const [call] = await db
      .select()
      .from(schema.calls)
      .where(and(eq(schema.calls.id, c.req.param("id")), eq(schema.calls.clinicId, clinicId)));
    if (!call) throw new CoreError("not_found", "call not found");
    const turns = await db
      .select()
      .from(schema.callTurns)
      .where(and(eq(schema.callTurns.callId, call.id), eq(schema.callTurns.clinicId, clinicId)))
      .orderBy(schema.callTurns.seq);
    return c.json({ call, turns });
  });
  return r;
}
