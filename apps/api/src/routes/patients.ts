import { Hono } from "hono";
import {
  createPatient,
  getPatient,
  listPatients,
  revealPatientPhone,
  updatePatient,
} from "@muxaris/core";
import type { Db } from "@muxaris/db";
import { patientBody, patientPatchBody, patientsQuery } from "@muxaris/shared";
import type { AppEnv } from "../deps.js";
import { requireClinic } from "../auth/middleware.js";
import { v } from "../validate.js";

export function patientRoutes(db: Db) {
  const r = new Hono<AppEnv>();
  const member = requireClinic(db);

  r.get("/patients", member, v("query", patientsQuery), async (c) => {
    const { q, limit, offset } = c.req.valid("query");
    return c.json(
      await listPatients(db, c.get("clinic").id, { ...(q ? { q } : {}), limit, offset }),
    );
  });

  r.post("/patients", member, v("json", patientBody), async (c) => {
    const b = c.req.valid("json");
    const patient = await createPatient(db, c.get("clinic").id, {
      phone: b.phone,
      ...(b.name ? { name: b.name } : {}),
      ...(b.email ? { email: b.email } : {}),
      ...(b.preferredLanguage ? { preferredLanguage: b.preferredLanguage } : {}),
      ...(b.dob ? { dob: b.dob } : {}),
      ...(b.notes ? { notes: b.notes } : {}),
    });
    return c.json({ patient }, 201);
  });

  r.get("/patients/:id", member, async (c) => {
    return c.json(await getPatient(db, c.get("clinic").id, c.req.param("id")));
  });

  r.patch("/patients/:id", member, v("json", patientPatchBody), async (c) => {
    const b = c.req.valid("json");
    const patient = await updatePatient(db, c.get("clinic").id, c.req.param("id"), {
      ...(b.name !== undefined ? { name: b.name ?? null } : {}),
      ...(b.email !== undefined ? { email: b.email ?? null } : {}),
      ...(b.preferredLanguage ? { preferredLanguage: b.preferredLanguage } : {}),
      ...(b.dob !== undefined ? { dob: b.dob ?? null } : {}),
      ...(b.notes !== undefined ? { notes: b.notes ?? null } : {}),
    });
    return c.json({ patient });
  });

  /** Audited: every reveal writes an audit_log row. The number is never logged. */
  r.post("/patients/:id/reveal-phone", member, async (c) => {
    return c.json(
      await revealPatientPhone(db, {
        clinicId: c.get("clinic").id,
        patientId: c.req.param("id"),
        actorUserId: c.get("user").id,
      }),
    );
  });
  return r;
}
