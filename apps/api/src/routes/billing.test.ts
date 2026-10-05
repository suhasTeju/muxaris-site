import { createHash, createHmac } from "node:crypto";
import { Hono } from "hono";
import { afterAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import pg from "pg";
import { createDb, schema, newId } from "@muxaris/db";
import { createDevVerifier, FakeRazorpay } from "@muxaris/core";
import { createApp } from "../app.js";
import { requestLog } from "../request-log.js";
import { razorpayWebhook } from "./billing.js";

const url = process.env.DATABASE_URL ?? "postgres://muxaris:muxaris@localhost:5433/muxaris";
const { db, pool } = createDb(url);

async function dbReachable(): Promise<boolean> {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}
const reachable = await dbReachable();
if (!reachable) console.warn("WARNING: Postgres unreachable, skipping billing route tests.");

const run = newId("t").slice(-8).toLowerCase();
const sub = `sub-bill-${run}`;
const subFd = `sub-billfd-${run}`;
const tok = `dev:${sub}:bill-${run}@test.example`;
const tokFd = `dev:${subFd}:billfd-${run}@test.example`;
const providerSubscriptionId = `sub_RT${run}`;
const eventIds: string[] = []; // billing_events ids are sha256(raw body)
const hashOf = (body: string) => {
  const h = createHash("sha256").update(body).digest("hex");
  eventIds.push(h);
  return h;
};
const envOn = {
  enabled: true,
  keyId: "rzp_test_k",
  keySecret: "s",
  webhookSecret: "whsec",
  standardPlanId: "plan_std",
};
const rz = new FakeRazorpay();
rz.nextId = providerSubscriptionId;
const verifier = createDevVerifier();
const app = createApp({ version: "test", db, verifier, billing: { env: envOn, client: rz } });
const appOff = createApp({
  version: "test",
  db,
  verifier,
  billing: { env: { ...envOn, enabled: false }, client: null },
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

const call = (
  a: typeof app,
  method: string,
  path: string,
  token: string,
  clinic?: string,
  body?: unknown,
) =>
  a.request(`/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(clinic ? { "X-Clinic-Id": clinic } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

let clinicId = "";
afterAll(async () => {
  if (reachable) {
    await db.delete(schema.billingEvents).where(inArray(schema.billingEvents.id, eventIds));
    if (clinicId) {
      await db.delete(schema.subscriptions).where(eq(schema.subscriptions.clinicId, clinicId));
      await db.delete(schema.auditLog).where(eq(schema.auditLog.clinicId, clinicId));
      await db.delete(schema.clinics).where(eq(schema.clinics.id, clinicId));
    }
    const users = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(inArray(schema.users.cognitoSub, [sub, subFd]));
    if (users.length) {
      const ids = users.map((u) => u.id);
      await db.delete(schema.memberships).where(inArray(schema.memberships.userId, ids));
      await db.delete(schema.users).where(inArray(schema.users.id, ids));
    }
  }
  await pool.end();
});

(reachable ? describe : describe.skip)("billing routes", () => {
  it("GET /v1/billing reports enabled state and no subscription", async () => {
    const created = await call(app, "POST", "/clinics", tok, undefined, {
      name: `Billing ${run}`,
      city: "Mysuru",
    });
    clinicId = (((await created.json()) as J).clinic as J).id;
    const res = await call(app, "GET", "/billing", tok, clinicId);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: true, keyId: "rzp_test_k", subscription: null });
    const off = await (await call(appOff, "GET", "/billing", tok, clinicId)).json();
    expect(off).toEqual({ enabled: false, keyId: null, subscription: null });
  });

  it("owner starts a subscription; front desk gets 403; disabled deployments get 404", async () => {
    // front desk member
    await call(app, "GET", "/me", tokFd);
    const [fd] = await db.select().from(schema.users).where(eq(schema.users.cognitoSub, subFd));
    await db.insert(schema.memberships).values({
      id: newId("mem"),
      userId: fd!.id,
      clinicId,
      role: "front_desk",
    });
    const denied = await call(app, "POST", "/billing/subscriptions", tokFd, clinicId, {});
    expect(denied.status).toBe(403);
    expect(((await denied.json()) as J).error.code).toBe("forbidden");

    const off = await call(appOff, "POST", "/billing/subscriptions", tok, clinicId, {});
    expect(off.status).toBe(404);
    expect(((await off.json()) as J).error.code).toBe("billing_disabled");

    const ok = await call(app, "POST", "/billing/subscriptions", tok, clinicId, {});
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({
      providerSubscriptionId,
      keyId: "rzp_test_k",
    });
    const status = (await (await call(app, "GET", "/billing", tok, clinicId)).json()) as J;
    expect(status.subscription).toMatchObject({ providerSubscriptionId, status: "created" });
    expect(JSON.stringify(status)).not.toContain('"s"');
    const again = await call(app, "POST", "/billing/subscriptions", tok, clinicId, {});
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ providerSubscriptionId });
    expect(rz.created).toHaveLength(1);
  });

  const webhookBody = (id: string) =>
    JSON.stringify({
      event: "subscription.activated",
      payload: {
        subscription: {
          entity: { id, status: "active", plan_id: "plan_std", current_end: null },
        },
      },
    });
  const sign = (body: string) => createHmac("sha256", "whsec").update(body).digest("hex");
  /** A same-length hex string that differs from the real signature in its first character. */
  const flip = (sig: string) => (sig.startsWith("0") ? "1" : "0") + sig.slice(1);
  const post = (a: typeof app, body: string, headers: Record<string, string>) =>
    a.request("/webhooks/razorpay", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body,
    });

  it("webhook: valid signature applies, wrong signature 400, retry of the same body is a duplicate", async () => {
    const body = webhookBody(providerSubscriptionId);
    hashOf(body);
    const sig = sign(body);
    const first = await post(app, body, { "X-Razorpay-Signature": sig });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ result: "applied" });
    const bad = await post(app, body, { "X-Razorpay-Signature": flip(sig) });
    expect(bad.status).toBe(400);
    const dup = await post(app, body, { "X-Razorpay-Signature": sig });
    expect(dup.status).toBe(200);
    expect(await dup.json()).toEqual({ result: "duplicate" });
    const [clinic] = await db.select().from(schema.clinics).where(eq(schema.clinics.id, clinicId));
    expect(clinic?.plan).toBe("standard");
    expect((await post(appOff, body, { "X-Razorpay-Signature": sig })).status).toBe(404);
  });

  it("replaying a signed body under fresh event-id headers is a duplicate, one row", async () => {
    const body = webhookBody(providerSubscriptionId);
    const sig = sign(body);
    const res = await post(app, body, {
      "X-Razorpay-Signature": sig,
      "X-Razorpay-Event-Id": `evt_fresh_1_${run}`,
    });
    expect(await res.json()).toEqual({ result: "duplicate" });
    const res2 = await post(app, body, {
      "X-Razorpay-Signature": sig,
      "X-Razorpay-Event-Id": `evt_fresh_2_${run}`,
    });
    expect(await res2.json()).toEqual({ result: "duplicate" });
    const rows = await db
      .select()
      .from(schema.billingEvents)
      .where(eq(schema.billingEvents.id, hashOf(body)));
    expect(rows).toHaveLength(1);
  });

  it("authentic events without a subscription entity are 200 ignored and leave no row", async () => {
    const body = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: {} } },
    });
    const id = hashOf(body);
    const res = await post(app, body, { "X-Razorpay-Signature": sign(body) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: "ignored" });
    const rows = await db
      .select()
      .from(schema.billingEvents)
      .where(eq(schema.billingEvents.id, id));
    expect(rows).toHaveLength(0);
  });

  it("webhook rejects an oversized body with 413", async () => {
    const big = "x".repeat(70 * 1024);
    const res = await post(app, big, { "X-Razorpay-Signature": sign(big) });
    expect(res.status).toBe(413);
  });

  it("webhook never logs the signature or body", async () => {
    const spies = [vi.spyOn(console, "log"), vi.spyOn(console, "error"), vi.spyOn(console, "warn")];
    const lines: string[] = [];
    const logged = new Hono();
    logged.use(requestLog((l) => lines.push(l)));
    logged.route("/", razorpayWebhook(db, { env: envOn }));
    const good = webhookBody(providerSubscriptionId);
    const malformed = '{"event":"subscription.activated","oops": ';
    const secrets = [sign(good), good, sign(malformed), malformed, hashOf(good)];
    for (const body of [good, malformed]) {
      await logged.request("/webhooks/razorpay", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Razorpay-Signature": sign(body) },
        body,
      });
    }
    await post(app, good, { "X-Razorpay-Signature": flip(sign(good)) });
    const out = [...lines, ...spies.flatMap((x) => x.mock.calls.flat().map(String))].join("\n");
    spies.forEach((x) => x.mockRestore());
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain("POST /webhooks/razorpay");
    for (const secret of secrets) expect(out).not.toContain(secret);
    expect(out).not.toContain("subscription.activated");
  });
});
