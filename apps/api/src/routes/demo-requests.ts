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

interface NodeBindings {
  incoming?: { socket?: { remoteAddress?: string } };
}

/**
 * Caller IP for rate limiting. Behind the load balancer (TRUST_PROXY=1) it is the last
 * x-forwarded-for hop, the one the balancer appended. Otherwise the socket peer address is used
 * and forwarded headers are ignored (they are client-controlled). Returns null when unknown.
 */
export function clientIp(c: Context, trustProxy: boolean): string | null {
  if (trustProxy) {
    const last = c.req.header("x-forwarded-for")?.split(",").pop()?.trim();
    if (last) return last;
  }
  const peer = (c.env as NodeBindings | undefined)?.incoming?.socket?.remoteAddress;
  return peer || null;
}

/** Public (no auth) marketing-site demo request intake. */
export function demoRequestRoutes(
  db: Db,
  allow = createRateLimiter(),
  trustProxy = process.env.TRUST_PROXY === "1",
) {
  const r = new Hono();
  r.post("/demo-requests", async (c) => {
    const ip = clientIp(c, trustProxy);
    if (ip === null) {
      // Never share one bucket between unidentifiable callers: allow, and make it visible.
      console.warn("demo-requests: could not determine client IP; rate limit skipped");
    } else if (!allow(ip)) {
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
