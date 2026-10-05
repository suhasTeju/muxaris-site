import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { billingFromEnv, createRazorpayClient, verifyRazorpaySignature } from "./razorpay.js";

describe("razorpay", () => {
  it("verifies an HMAC-SHA256 hex signature and rejects a wrong or missing one", () => {
    const secret = "whsec_test";
    const body = '{"event":"subscription.activated"}';
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyRazorpaySignature(body, sig, secret)).toBe(true);
    expect(verifyRazorpaySignature(body, sig.replace(/^./, "0"), secret)).toBe(false);
    expect(verifyRazorpaySignature(body, undefined, secret)).toBe(false);
    expect(verifyRazorpaySignature(body, "short", secret)).toBe(false);
  });

  it("creates a subscription with basic auth and returns its id", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fakeFetch: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ id: "sub_123", status: "created" }), { status: 200 });
    };
    const rz = createRazorpayClient({ keyId: "rzp_test_k", keySecret: "s", fetch: fakeFetch });
    const r = await rz.createSubscription({
      planId: "plan_std",
      totalCount: 12,
      notes: { clinicId: "cl_1" },
    });
    expect(r.id).toBe("sub_123");
    expect(calls[0]?.url).toBe("https://api.razorpay.com/v1/subscriptions");
    expect((calls[0]?.init.headers as Record<string, string>)["Authorization"]).toBe(
      `Basic ${Buffer.from("rzp_test_k:s").toString("base64")}`,
    );
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      plan_id: "plan_std",
      total_count: 12,
      customer_notify: 1,
    });
  });

  it("surfaces provider errors without the secret", async () => {
    const rz = createRazorpayClient({
      keyId: "k",
      keySecret: "TOPSECRET",
      fetch: async () => new Response('{"error":{"description":"bad plan"}}', { status: 400 }),
    });
    await expect(rz.createSubscription({ planId: "x", totalCount: 1, notes: {} })).rejects.toThrow(
      /bad plan/,
    );
    await expect(
      rz.createSubscription({ planId: "x", totalCount: 1, notes: {} }),
    ).rejects.not.toThrow(/TOPSECRET/);
  });

  it("billingFromEnv is off by default and strict when on", () => {
    expect(billingFromEnv({}).enabled).toBe(false);
    expect(() => billingFromEnv({ BILLING_ENABLED: "1" })).toThrow(/RAZORPAY_KEY_ID/);
    expect(
      billingFromEnv({
        BILLING_ENABLED: "1",
        RAZORPAY_KEY_ID: "k",
        RAZORPAY_KEY_SECRET: "s",
        RAZORPAY_WEBHOOK_SECRET: "w",
        RAZORPAY_PLAN_ID_STANDARD: "p",
      }),
    ).toMatchObject({ enabled: true, standardPlanId: "p" });
  });

  it("maps a network failure to a provider error", async () => {
    const rz = createRazorpayClient({
      keyId: "k",
      keySecret: "s",
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
    });
    await expect(
      rz.createSubscription({ planId: "p", totalCount: 1, notes: {} }),
    ).rejects.toMatchObject({ code: "provider", message: "razorpay unreachable" });
  });
});
