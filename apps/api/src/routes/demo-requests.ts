import { Hono } from "hono";
import type { Context } from "hono";
import { schema, newId, type Db } from "@muxaris/db";
import { demoRequestBody } from "@muxaris/shared";

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;

/** In-memory sliding-window limiter keyed by IP. Per-process: adequate for a low-volume form. */
export function createRateLimiter(max = MAX_PER_WINDOW, windowMs = WINDOW_MS, now = Date.now) {
  const hits = new Map<string, number[]>();
  return (key: string): boolean => {
    const t = now();
    const recent = (hits.get(key) ?? []).filter((x) => t - x < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(t);
    hits.set(key, recent);
    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (v.every((x) => t - x >= windowMs)) hits.delete(k);
    }
    return true;
  };
}

function clientIp(c: Context): string {
  const fwd = c.req.header("x-forwarded-for");
  // Behind the load balancer the last hop is the one it appended; earlier entries are client-supplied.
  const last = fwd?.split(",").pop()?.trim();
  return last || c.req.header("x-real-ip") || "unknown";
}

/** Public (no auth) marketing-site demo request intake. */
export function demoRequestRoutes(db: Db, allow = createRateLimiter()) {
  const r = new Hono();
  r.post("/demo-requests", async (c) => {
    if (!allow(clientIp(c))) {
      return c.json(
        { error: { code: "rate_limited", message: "Too many requests. Please try again later." } },
        429,
      );
    }
    const raw = await c.req.json().catch(() => null);
    const parsed = demoRequestBody.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: { code: "validation", issues: parsed.error.issues } }, 400);
    }
    const body = parsed.data;
    // Honeypot: pretend success so bots learn nothing, store nothing.
    if (body.website) return c.json({ ok: true });
    await db.insert(schema.demoRequests).values({
      id: newId("dem"),
      name: body.name,
      clinic: body.clinic,
      city: body.city,
      phone: body.phone,
      email: body.email,
      specialty: body.specialty,
      language: body.language,
    });
    return c.json({ ok: true }, 201);
  });
  return r;
}
