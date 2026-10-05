import { createHmac, timingSafeEqual } from "node:crypto";
import { CoreError } from "../services/errors.js";

export interface RazorpayClient {
  createSubscription(input: {
    planId: string;
    totalCount: number;
    notes: Record<string, string>;
  }): Promise<{ id: string; status: string; shortUrl?: string }>;
}

/** HMAC-SHA256 hex of the raw body, compared in constant time. */
export function verifyRazorpaySignature(
  rawBody: string,
  signature: string | undefined,
  webhookSecret: string,
): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createRazorpayClient(opts: {
  keyId: string;
  keySecret: string;
  fetch?: typeof fetch;
  baseUrl?: string;
}): RazorpayClient {
  const f = opts.fetch ?? fetch;
  const base = opts.baseUrl ?? "https://api.razorpay.com/v1";
  const auth = `Basic ${Buffer.from(`${opts.keyId}:${opts.keySecret}`).toString("base64")}`;
  return {
    async createSubscription(input) {
      let res: Response;
      let text: string;
      try {
        res = await f(`${base}/subscriptions`, {
          method: "POST",
          headers: { Authorization: auth, "Content-Type": "application/json" },
          body: JSON.stringify({
            plan_id: input.planId,
            total_count: input.totalCount,
            customer_notify: 1,
            notes: input.notes,
          }),
          signal: AbortSignal.timeout(10_000),
        });
        text = await res.text();
      } catch {
        throw new CoreError("provider", "razorpay unreachable");
      }
      if (!res.ok) {
        let description = `razorpay ${res.status}`;
        try {
          description =
            (JSON.parse(text) as { error?: { description?: string } }).error?.description ??
            description;
        } catch {
          /* keep the status-only message */
        }
        throw new CoreError("provider", description);
      }
      let body: { id?: unknown; status?: unknown; short_url?: unknown };
      try {
        body = JSON.parse(text) as typeof body;
      } catch {
        throw new CoreError("provider", "razorpay returned an unreadable response");
      }
      if (typeof body.id !== "string" || typeof body.status !== "string") {
        throw new CoreError("provider", "razorpay returned an unexpected response");
      }
      return {
        id: body.id,
        status: body.status,
        ...(typeof body.short_url === "string" && body.short_url
          ? { shortUrl: body.short_url }
          : {}),
      };
    },
  };
}

/** In-memory stand-in for tests and local runs with billing off. */
export class FakeRazorpay implements RazorpayClient {
  created: Array<{ planId: string; totalCount: number; notes: Record<string, string> }> = [];
  nextId = "sub_FAKE1";
  async createSubscription(input: {
    planId: string;
    totalCount: number;
    notes: Record<string, string>;
  }) {
    this.created.push(input);
    return { id: this.nextId, status: "created" };
  }
}

export interface BillingEnv {
  enabled: boolean;
  keyId: string | null;
  keySecret: string | null;
  webhookSecret: string | null;
  standardPlanId: string | null;
}

export function billingFromEnv(src: NodeJS.ProcessEnv): BillingEnv {
  if (src.BILLING_ENABLED !== "1") {
    return {
      enabled: false,
      keyId: null,
      keySecret: null,
      webhookSecret: null,
      standardPlanId: null,
    };
  }
  const need = (name: string): string => {
    const v = src[name];
    if (!v) throw new Error(`${name} is required when BILLING_ENABLED=1`);
    return v;
  };
  return {
    enabled: true,
    keyId: need("RAZORPAY_KEY_ID"),
    keySecret: need("RAZORPAY_KEY_SECRET"),
    webhookSecret: need("RAZORPAY_WEBHOOK_SECRET"),
    standardPlanId: need("RAZORPAY_PLAN_ID_STANDARD"),
  };
}
