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
    expect(() =>
      parseRazorpayEvent({ event: "subscription.activated", payload: {} }, "evt_x"),
    ).toThrow(/subscription/);
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

  it("starts a subscription once and refuses a second active one", async () => {
    const rz = new FakeRazorpay();
    rz.nextId = SUB;
    const r = await startStandardSubscription(db, rz, {
      clinicId: c.clinic.id,
      actorUserId: c.user.id,
      standardPlanId: "plan_std",
    });
    expect(r.providerSubscriptionId).toBe(SUB);
    expect(rz.created[0]?.notes).toEqual({ clinicId: c.clinic.id });
    await expect(
      startStandardSubscription(db, rz, {
        clinicId: c.clinic.id,
        actorUserId: c.user.id,
        standardPlanId: "plan_std",
      }),
    ).rejects.toMatchObject({ code: "conflict" });
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
