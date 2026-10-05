import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getCallAnalytics, getMonthlyUsage, CoreError } from "@muxaris/core";
import { schema, type Db } from "@muxaris/db";
import { analyticsCallsQuery, analyticsUsageQuery } from "@muxaris/shared";
import type { AppEnv } from "../deps.js";
import { requireClinic } from "../auth/middleware.js";
import { v } from "../validate.js";

async function clinicTz(db: Db, clinicId: string): Promise<string> {
  const [c] = await db
    .select({ timezone: schema.clinics.timezone })
    .from(schema.clinics)
    .where(eq(schema.clinics.id, clinicId));
  if (!c) throw new CoreError("not_found", "clinic not found");
  return c.timezone;
}

export function analyticsRoutes(db: Db) {
  const r = new Hono<AppEnv>();
  const member = requireClinic(db);
  r.get("/analytics/calls", member, v("query", analyticsCallsQuery), async (c) => {
    const clinicId = c.get("clinic").id;
    const { from, to } = c.req.valid("query");
    const timezone = await clinicTz(db, clinicId);
    return c.json(await getCallAnalytics(db, clinicId, { from, to, timezone }));
  });
  r.get("/analytics/usage", member, v("query", analyticsUsageQuery), async (c) => {
    const clinicId = c.get("clinic").id;
    const timezone = await clinicTz(db, clinicId);
    const { months } = c.req.valid("query");
    return c.json({ months: await getMonthlyUsage(db, clinicId, months, new Date(), timezone) });
  });
  return r;
}
