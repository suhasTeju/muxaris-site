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
  updateClinicProfile,
  updateDoctor,
  updateService,
  updateSlotRules,
  CoreError,
} from "@muxaris/core";
import {
  BULBUL_V3_SPEAKERS,
  LANGUAGE_CODES,
  assistantProfileBody,
  doctorBody,
  indianPhone,
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

const previewBody = z.object({
  text: z.string().trim().min(1).max(300),
  language: z.enum(LANGUAGE_CODES),
  speaker: z.enum(BULBUL_V3_SPEAKERS),
});

const someField = (b: object) => Object.keys(b).length > 0;
const NOTHING = "Provide at least one field";
/** Settings edits in place: any subset of the create fields. */
const doctorPatchBody = doctorBody.partial().strict().refine(someField, NOTHING);
const servicePatchBody = serviceBody.partial().strict().refine(someField, NOTHING);
/** The clinic's own details (Settings → Clinic). Slug, timezone, plan and settings stay put. */
const clinicProfileBody = z
  .object({
    name: z.string().trim().min(1).max(120),
    city: z.string().trim().min(1).max(120),
    address: z.string().trim().max(2000).nullable(),
    phone: indianPhone.nullable(),
    languages: z.array(z.enum(LANGUAGE_CODES)).min(1).max(20),
  })
  .partial()
  .strict()
  .refine(someField, NOTHING);

const PREVIEW_WINDOW_MS = 60 * 60 * 1000;
const PREVIEW_MAX = 30;
const SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech";

export interface CatalogOptions {
  /** Defaults to SARVAM_TTS_API_KEY from the process environment, read per request. */
  env?: { provider: "sarvam" | "mock"; sarvamKey: string | null };
  fetch?: typeof fetch;
  now?: () => number;
}

/** Per-clinic in-memory sliding window (per-process). */
function createPreviewLimiter(now: () => number) {
  const hits = new Map<string, number[]>();
  return (key: string): boolean => {
    const t = now();
    for (const [k, v] of hits) {
      if (k !== key && v.every((x) => t - x >= PREVIEW_WINDOW_MS)) hits.delete(k);
    }
    const recent = (hits.get(key) ?? []).filter((x) => t - x < PREVIEW_WINDOW_MS);
    if (recent.length >= PREVIEW_MAX) {
      hits.set(key, recent);
      return false;
    }
    recent.push(t);
    hits.set(key, recent);
    return true;
  };
}

const stripUndefined = <T extends object>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
const hhmm = (t: string) => t.slice(0, 5);

export function catalogRoutes(db: Db, opts: CatalogOptions = {}) {
  const r = new Hono<AppEnv>();
  const doFetch = opts.fetch ?? fetch;
  const allowPreview = createPreviewLimiter(opts.now ?? Date.now);
  const member = requireClinic(db);
  const owner = requireClinic(db, "owner");

  r.get("/doctors", member, async (c) => {
    const clinicId = c.get("clinic").id;
    const [docs, hours] = await Promise.all([
      listDoctors(db, clinicId),
      db
        .select()
        .from(schema.workingHours)
        .where(eq(schema.workingHours.clinicId, clinicId))
        .orderBy(schema.workingHours.weekday, schema.workingHours.startTime),
    ]);
    return c.json({
      doctors: docs.map((d) => ({
        ...d,
        workingHours: hours
          .filter((h) => h.doctorId === d.id)
          .map((h) => ({
            weekday: h.weekday,
            startTime: hhmm(h.startTime),
            endTime: hhmm(h.endTime),
          })),
      })),
    });
  });
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
  r.patch("/doctors/:id", owner, v("json", doctorPatchBody), async (c) => {
    const doctor = await updateDoctor(db, {
      clinicId: c.get("clinic").id,
      doctorId: c.req.param("id"),
      actorUserId: c.get("user").id,
      patch: stripUndefined(c.req.valid("json")),
    });
    return c.json({ doctor });
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

  r.patch("/services/:id", owner, v("json", servicePatchBody), async (c) => {
    const service = await updateService(db, {
      clinicId: c.get("clinic").id,
      serviceId: c.req.param("id"),
      actorUserId: c.get("user").id,
      patch: stripUndefined(c.req.valid("json")),
    });
    return c.json({ service });
  });

  r.patch("/clinic", owner, v("json", clinicProfileBody), async (c) => {
    const clinic = await updateClinicProfile(db, {
      clinicId: c.get("clinic").id,
      actorUserId: c.get("user").id,
      patch: stripUndefined(c.req.valid("json")),
    });
    return c.json({ clinic });
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

  r.post("/assistant/preview", member, v("json", previewBody), async (c) => {
    const key = opts.env ? opts.env.sarvamKey : process.env.SARVAM_TTS_API_KEY?.trim() || null;
    const provider = opts.env ? opts.env.provider : key ? "sarvam" : "mock";
    if (provider === "mock" || !key) {
      return c.json(
        { error: { code: "provider_unavailable", message: "voice preview is not configured" } },
        503,
      );
    }
    if (!allowPreview(c.get("clinic").id)) {
      return c.json({ error: { code: "rate_limited", message: "too many previews" } }, 429);
    }
    const b = c.req.valid("json");
    let res: Response;
    try {
      res = await doFetch(SARVAM_TTS_URL, {
        method: "POST",
        headers: { "api-subscription-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          text: b.text,
          target_language_code: b.language,
          speaker: b.speaker,
          model: "bulbul:v3",
          speech_sample_rate: 24000,
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      return c.json({ error: { code: "tts_failed", message: "voice provider unreachable" } }, 502);
    }
    if (!res.ok) {
      return c.json(
        { error: { code: "tts_failed", message: `voice provider error (${res.status})` } },
        502,
      );
    }
    const data = (await res.json().catch(() => null)) as { audios?: unknown } | null;
    const audio = Array.isArray(data?.audios) ? data.audios[0] : undefined;
    if (typeof audio !== "string" || !audio) {
      return c.json({ error: { code: "tts_failed", message: "no audio returned" } }, 502);
    }
    return new Response(Buffer.from(audio, "base64"), {
      status: 200,
      headers: { "Content-Type": "audio/wav", "Cache-Control": "private, no-store" },
    });
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
