import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { schema } from "@muxaris/db";
import { FakeRazorpay } from "./razorpay.js";
import {
  applyRazorpayEvent,
  parseRazorpayEvent,
  startStandardSubscription,
} from "./subscriptions.js";
import {
  dbReachable,
  makeTestClinic,
  openDb,
  warnIfUnreachable,
} from "../services/test-support.js";

const reachable = await dbReachable();
warnIfUnreachable(reachable, "billing subscriptions");
const { db, pool } = openDb();

const run = Math.random().toString(36).slice(2, 10);
const eid = (n: number) => `evt_${run}_${n}`;
const SUB = `sub_FAKE_${run}`;
const ev = (id: string, event: string, status: string, subId = SUB) =>
  parseRazorpayEvent(
    {
      event,
      payload: {
        subscription: {
          entity: { id: subId, status, plan_id: "plan_std", current_end: 1_800_000_000 },
        },
      },
    },
    id,
  );

describe("parseRazorpayEvent", () => {
  it("rejects bodies without an event id, event name or subscription entity", () => {
    expect(() => parseRazorpayEvent({ event: "x" }, "evt_x")).toThrow(/payload/);
    expect(() =>
      parseRazorpayEvent(
        { payload: { subscription: { entity: { id: "s", status: "active", plan_id: "p" } } } },
        "evt_x",
      ),
    ).toThrow(/event/);
    expect(() =>
      parseRazorpayEvent(
        {
          event: "subscription.activated",
          payload: { subscription: { entity: { id: "s", status: "active", plan_id: "p" } } },
        },
        undefined,
      ),
    ).toThrow(/event id/i);
  });

  it("accepts events without a subscription entity and ignores them without a billing_events row", async () => {
    const e = parseRazorpayEvent(
      { event: "payment.captured", payload: { payment: {} } },
      "evt_pay",
    );
    expect(e.subscription).toBeUndefined();
    if (reachable) {
      expect(await applyRazorpayEvent(db, e)).toBe("ignored");
      const rows = await db
        .select()
        .from(schema.billingEvents)
        .where(eq(schema.billingEvents.id, "evt_pay"));
      expect(rows).toHaveLength(0);
    }
  });

  it("rejects a non-integer, negative or absurd current_end", () => {
    for (const current_end of [1.5, -1, 5_000_000_000]) {
      expect(() =>
        parseRazorpayEvent(
          {
            event: "subscription.activated",
            payload: {
              subscription: { entity: { id: "s", status: "active", plan_id: "p", current_end } },
            },
          },
          "evt_x",
        ),
      ).toThrow();
    }
  });
});

(reachable ? describe : describe.skip)("subscription lifecycle", () => {
  let c: Awaited<ReturnType<typeof makeTestClinic>>;
  beforeAll(async () => {
    c = await makeTestClinic(db, "billing");
  });
  afterAll(async () => {
    await db
      .delete(schema.billingEvents)
      .where(inArray(schema.billingEvents.id, [1, 2, 9].map(eid)));
    await c.cleanup();
    await pool.end();
  });

  it("a second start while checkout is pending reuses the created subscription", async () => {
    const rz = new FakeRazorpay();
    rz.nextId = SUB;
    const input = { clinicId: c.clinic.id, actorUserId: c.user.id, standardPlanId: "plan_std" };
    const first = await startStandardSubscription(db, rz, input);
    expect(first.providerSubscriptionId).toBe(SUB);
    expect(rz.created[0]?.notes).toEqual({ clinicId: c.clinic.id });
    const second = await startStandardSubscription(db, rz, input);
    expect(second).toEqual(first);
    expect(rz.created.length).toBe(1);
  });

  it("refuses a new start while a subscription is active", async () => {
    const rz = new FakeRazorpay();
    const input = { clinicId: c.clinic.id, actorUserId: c.user.id, standardPlanId: "plan_std" };
    const setStatus = (status: string) =>
      db
        .update(schema.subscriptions)
        .set({ status })
        .where(eq(schema.subscriptions.clinicId, c.clinic.id));
    for (const status of ["active", "authenticated", "pending", "halted"]) {
      await setStatus(status);
      await expect(startStandardSubscription(db, rz, input)).rejects.toMatchObject({
        code: "conflict",
      });
    }
    await setStatus("created");
    expect(rz.created.length).toBe(0);
  });

  it("audits the start once", async () => {
    const audits = await db
      .select()
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.clinicId, c.clinic.id),
          eq(schema.auditLog.action, "clinic.subscription.start"),
        ),
      );
    expect(audits[0]?.data).toEqual({ subscriptionId: SUB });
  });

  it("activates the plan on subscription.activated, once per event id, and reverts on cancelled", async () => {
    expect(await applyRazorpayEvent(db, ev(eid(1), "subscription.activated", "active"))).toBe(
      "applied",
    );
    expect(await applyRazorpayEvent(db, ev(eid(1), "subscription.activated", "active"))).toBe(
      "duplicate",
    );
    let [clinic] = await db.select().from(schema.clinics).where(eq(schema.clinics.id, c.clinic.id));
    expect(clinic?.plan).toBe("standard");
    const audits = await db
      .select()
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.clinicId, c.clinic.id),
          eq(schema.auditLog.action, "clinic.plan.change"),
        ),
      );
    expect(audits).toHaveLength(1);
    expect(audits[0]?.data).toEqual({ from: "pilot", to: "standard", subscriptionId: SUB });
    expect(await applyRazorpayEvent(db, ev(eid(2), "subscription.cancelled", "cancelled"))).toBe(
      "applied",
    );
    [clinic] = await db.select().from(schema.clinics).where(eq(schema.clinics.id, c.clinic.id));
    expect(clinic?.plan).toBe("pilot");
  });

  it("unknown subscription ids are acknowledged and ignored", async () => {
    expect(
      await applyRazorpayEvent(db, ev(eid(9), "subscription.activated", "active", "sub_NOPE")),
    ).toBe("ignored");
  });

  it("a duplicate event id is ignored even with a different payload", async () => {
    expect(await applyRazorpayEvent(db, ev(eid(2), "subscription.activated", "active"))).toBe(
      "duplicate",
    );
    const [clinic] = await db
      .select()
      .from(schema.clinics)
      .where(eq(schema.clinics.id, c.clinic.id));
    expect(clinic?.plan).toBe("pilot");
  });
});
