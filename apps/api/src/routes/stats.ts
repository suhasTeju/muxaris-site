import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getOverviewStats, CoreError } from "@muxaris/core";
import { schema, type Db } from "@muxaris/db";
import type { AppEnv } from "../deps.js";
import { requireClinic } from "../auth/middleware.js";
import { dateParam, v } from "../validate.js";

const statsQuery = z.object({ date: dateParam.optional() });

/** UTC offset (e.g. "+05:30") of `timeZone` at local noon on `date`. */
function zoneOffset(date: string, timeZone: string): string {
  const probe = new Date(`${date}T12:00:00Z`);
  const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(probe)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = part?.match(/^GMT(?:([+-]\d{2}):?(\d{2})?)?$/);
  if (!m) return "Z";
  return m[1] ? `${m[1]}:${m[2] ?? "00"}` : "Z";
}

/** [00:00, 24:00) of `date` in `timeZone` as absolute instants. */
export function dayWindow(date: string, timeZone: string): { dayStart: Date; dayEnd: Date } {
  const dayStart = new Date(`${date}T00:00:00${zoneOffset(date, timeZone)}`);
  return { dayStart, dayEnd: new Date(dayStart.getTime() + 86_400_000) };
}

export function statsRoutes(db: Db) {
  const r = new Hono<AppEnv>();
  const member = requireClinic(db);

  r.get("/stats/overview", member, v("query", statsQuery), async (c) => {
    const clinicId = c.get("clinic").id;
    const [clinic] = await db
      .select({ timezone: schema.clinics.timezone })
      .from(schema.clinics)
      .where(eq(schema.clinics.id, clinicId));
    if (!clinic) throw new CoreError("not_found", "clinic not found");
    const date =
      c.req.valid("query").date ??
      new Intl.DateTimeFormat("en-CA", { timeZone: clinic.timezone }).format(new Date());
    const stats = await getOverviewStats(db, clinicId, dayWindow(date, clinic.timezone));
    return c.json({ date, ...stats });
  });
  return r;
}
