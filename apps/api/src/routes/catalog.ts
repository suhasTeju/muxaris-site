import { Hono } from "hono";
import { schema, type Db } from "@muxaris/db";
import { eq } from "drizzle-orm";
import {
  createDoctor,
  createService,
  findAvailableSlots,
  getSlotRules,
  listDoctors,
  listServices,
  setWorkingHours,
  updateSlotRules,
  CoreError,
} from "@muxaris/core";
import {
  assistantProfileBody,
  doctorBody,
  serviceBody,
  slotRulesBody,
  workingHoursBody,
} from "@muxaris/shared";
import { z } from "zod";
import type { AppEnv } from "../deps.js";
import { requireClinic } from "../auth/middleware.js";
import { dateParam, v } from "../validate.js";

const slotsQuery = z.object({
  date: dateParam,
  serviceId: z.string().min(1),
  doctorId: z.string().min(1).optional(),
  partOfDay: z.enum(["morning", "afternoon", "evening"]).optional(),
});

const stripUndefined = <T extends object>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
const hhmm = (t: string) => t.slice(0, 5);

export function catalogRoutes(db: Db) {
  const r = new Hono<AppEnv>();
  const member = requireClinic(db);
  const owner = requireClinic(db, "owner");

  r.get("/doctors", member, async (c) =>
    c.json({ doctors: await listDoctors(db, c.get("clinic").id) }),
  );
  r.post("/doctors", owner, v("json", doctorBody), async (c) => {
    const b = c.req.valid("json");
    const doctor = await createDoctor(db, c.get("clinic").id, {
      name: b.name,
      ...(b.title ? { title: b.title } : {}),
      ...(b.specialties ? { specialties: b.specialties } : {}),
      ...(b.languages ? { languages: b.languages } : {}),
      ...(b.color ? { color: b.color } : {}),
      ...(b.active !== undefined ? { active: b.active } : {}),
    });
    return c.json({ doctor }, 201);
  });
  r.put("/doctors/:id/hours", owner, v("json", workingHoursBody), async (c) => {
    const rows = await setWorkingHours(
      db,
      c.get("clinic").id,
      c.req.param("id"),
      c.req.valid("json").hours,
    );
    return c.json({
      hours: rows.map((h) => ({ ...h, startTime: hhmm(h.startTime), endTime: hhmm(h.endTime) })),
    });
  });

  r.get("/services", member, async (c) =>
    c.json({ services: await listServices(db, c.get("clinic").id) }),
  );
  r.post("/services", owner, v("json", serviceBody), async (c) => {
    const b = c.req.valid("json");
    const service = await createService(db, c.get("clinic").id, {
      name: b.name,
      durationMin: b.durationMin,
      ...(b.description ? { description: b.description } : {}),
      ...(b.bufferMin !== undefined ? { bufferMin: b.bufferMin } : {}),
      ...(b.priceInr != null ? { priceInr: b.priceInr } : {}),
      ...(b.bookableByAi !== undefined ? { bookableByAi: b.bookableByAi } : {}),
      ...(b.active !== undefined ? { active: b.active } : {}),
    });
    return c.json({ service }, 201);
  });

  r.get("/slot-rules", member, async (c) =>
    c.json({ slotRules: await getSlotRules(db, c.get("clinic").id) }),
  );
  r.put("/slot-rules", owner, v("json", slotRulesBody), async (c) =>
    c.json({
      slotRules: await updateSlotRules(db, c.get("clinic").id, stripUndefined(c.req.valid("json"))),
    }),
  );

  r.get("/assistant", member, async (c) => {
    const [row] = await db
      .select()
      .from(schema.assistantProfiles)
      .where(eq(schema.assistantProfiles.clinicId, c.get("clinic").id));
    if (!row) throw new CoreError("not_found", "assistant profile not found");
    return c.json({ assistant: row });
  });
  r.put("/assistant", owner, v("json", assistantProfileBody), async (c) => {
    const b = c.req.valid("json");
    const clinicId = c.get("clinic").id;
    const patch = {
      ...(b.name !== undefined ? { name: b.name } : {}),
      ...(b.greeting !== undefined ? { greeting: b.greeting as Record<string, string> } : {}),
      ...(b.voices !== undefined ? { voices: b.voices as Record<string, string> } : {}),
      ...(b.tone !== undefined ? { tone: b.tone } : {}),
      ...(b.handoffNumber !== undefined ? { handoffNumber: b.handoffNumber } : {}),
      ...(b.faq !== undefined ? { faq: b.faq } : {}),
      ...(b.knowledge !== undefined ? { knowledge: b.knowledge } : {}),
    };
    const [row] = await db
      .insert(schema.assistantProfiles)
      .values({ clinicId, ...patch })
      .onConflictDoUpdate({
        target: schema.assistantProfiles.clinicId,
        set: Object.keys(patch).length ? patch : { updatedAt: new Date() },
      })
      .returning();
    return c.json({ assistant: row });
  });

  r.get("/slots", member, v("query", slotsQuery), async (c) => {
    const q = c.req.valid("query");
    const slots = await findAvailableSlots(db, {
      clinicId: c.get("clinic").id,
      date: q.date,
      serviceId: q.serviceId,
      ...(q.doctorId ? { doctorId: q.doctorId } : {}),
      ...(q.partOfDay ? { partOfDay: q.partOfDay } : {}),
    });
    return c.json({ slots });
  });
  return r;
}
