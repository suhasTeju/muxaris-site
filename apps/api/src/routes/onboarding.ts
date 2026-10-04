import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { schema, type Db } from "@muxaris/db";
import { CoreError, loadDemoClinicData } from "@muxaris/core";
import type { AppEnv } from "../deps.js";
import { requireClinic } from "../auth/middleware.js";
import { v } from "../validate.js";

export const ONBOARDING_STEPS = [
  "basics",
  "doctors",
  "services",
  "assistant",
  "review",
  "done",
] as const;
const stepBody = z.object({ step: z.enum(ONBOARDING_STEPS) });

export function onboardingRoutes(db: Db) {
  const r = new Hono<AppEnv>();
  r.get("/onboarding", requireClinic(db), async (c) => {
    const [row] = await db
      .select({ step: schema.clinics.onboardingStep })
      .from(schema.clinics)
      .where(eq(schema.clinics.id, c.get("clinic").id));
    if (!row) throw new CoreError("not_found", "clinic not found");
    return c.json({ step: row.step });
  });
  r.put("/onboarding/step", requireClinic(db, "owner"), v("json", stepBody), async (c) => {
    const [row] = await db
      .update(schema.clinics)
      .set({ onboardingStep: c.req.valid("json").step })
      .where(eq(schema.clinics.id, c.get("clinic").id))
      .returning({ step: schema.clinics.onboardingStep });
    if (!row) throw new CoreError("not_found", "clinic not found");
    return c.json({ step: row.step });
  });
  r.post("/demo/load", requireClinic(db, "owner"), async (c) => {
    await loadDemoClinicData(db, c.get("clinic").id);
    return c.json({ ok: true });
  });
  return r;
}
