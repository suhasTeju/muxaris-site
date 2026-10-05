import { createHash } from "node:crypto";
import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { schema, type Db } from "@muxaris/db";
import {
  applyRazorpayEvent,
  parseRazorpayEvent,
  startStandardSubscription,
  verifyRazorpaySignature,
  type BillingEnv,
  type RazorpayClient,
} from "@muxaris/core";
import type { AppEnv } from "../deps.js";
import { requireClinic } from "../auth/middleware.js";

const disabled = { error: { code: "billing_disabled", message: "billing is not enabled" } };

export function billingRoutes(db: Db, billing: { env: BillingEnv; client: RazorpayClient | null }) {
  const r = new Hono<AppEnv>();
  r.get("/billing", requireClinic(db), async (c) => {
    const clinicId = c.get("clinic").id;
    const [sub] = await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.clinicId, clinicId))
      .orderBy(desc(schema.subscriptions.createdAt))
      .limit(1);
    return c.json({
      enabled: billing.env.enabled,
      keyId: billing.env.enabled ? billing.env.keyId : null,
      subscription: sub
        ? {
            providerSubscriptionId: sub.providerSubscriptionId,
            status: sub.status,
            currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
          }
        : null,
    });
  });
  r.post("/billing/subscriptions", requireClinic(db, "owner"), async (c) => {
    if (!billing.env.enabled || !billing.client) return c.json(disabled, 404);
    const res = await startStandardSubscription(db, billing.client, {
      clinicId: c.get("clinic").id,
      actorUserId: c.get("user").id,
      standardPlanId: billing.env.standardPlanId!,
    });
    return c.json({ ...res, keyId: billing.env.keyId! });
  });
  return r;
}

/** Public. Reads the raw body and verifies the HMAC before parsing; logs nothing from it. */
export function razorpayWebhook(db: Db, billing: { env: BillingEnv }) {
  const r = new Hono();
  r.post("/webhooks/razorpay", async (c) => {
    if (!billing.env.enabled || !billing.env.webhookSecret) return c.json(disabled, 404);
    const raw = await c.req.text();
    if (
      !verifyRazorpaySignature(raw, c.req.header("X-Razorpay-Signature"), billing.env.webhookSecret)
    )
      return c.json({ error: { code: "bad_signature", message: "signature mismatch" } }, 400);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return c.json({ error: { code: "validation", message: "invalid JSON" } }, 400);
    }
    // The event-id header is not covered by the HMAC, so it cannot be the idempotency key (a
    // captured delivery could be replayed under fresh ids). Key on the signed body instead;
    // Razorpay retries resend the identical body.
    const ev = parseRazorpayEvent(parsed, createHash("sha256").update(raw).digest("hex"));
    return c.json({ result: await applyRazorpayEvent(db, ev) });
  });
  return r;
}
