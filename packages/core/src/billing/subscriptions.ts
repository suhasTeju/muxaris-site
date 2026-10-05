import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { schema, newId, type Db } from "@muxaris/db";
import { CoreError } from "../services/errors.js";
import type { RazorpayClient } from "./razorpay.js";

const { clinics, subscriptions, billingEvents, auditLog } = schema;

/** Statuses that block a new start. `created` (checkout never completed) is resumable instead. */
const BLOCKING_STATUSES = ["authenticated", "active", "pending", "halted", "paused"];

/**
 * Starts the Standard subscription for a clinic. The clinic row is locked FOR UPDATE for the
 * whole transaction so two concurrent starts cannot both pass the "already subscribed" check.
 * The provider call happens inside that transaction on purpose: the lock is per clinic and the
 * call is bounded by the client's 10 s AbortSignal.timeout, and doing it after commit would
 * risk a paid subscription at the provider with no local row.
 */
export async function startStandardSubscription(
  db: Db,
  rz: RazorpayClient,
  input: { clinicId: string; actorUserId: string; standardPlanId: string },
): Promise<{ subscriptionId: string; providerSubscriptionId: string }> {
  return db.transaction(async (tx) => {
    const [clinic] = await tx
      .select({ id: clinics.id })
      .from(clinics)
      .where(eq(clinics.id, input.clinicId))
      .for("update");
    if (!clinic) throw new CoreError("not_found", "clinic not found");
    const open = await tx
      .select({
        id: subscriptions.id,
        providerSubscriptionId: subscriptions.providerSubscriptionId,
        status: subscriptions.status,
      })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.clinicId, input.clinicId),
          inArray(subscriptions.status, [...BLOCKING_STATUSES, "created"]),
        ),
      )
      .orderBy(desc(subscriptions.createdAt));
    if (open.some((s) => s.status !== "created"))
      throw new CoreError("conflict", "clinic already has a subscription");
    const pending = open[0];
    if (pending)
      return { subscriptionId: pending.id, providerSubscriptionId: pending.providerSubscriptionId };
    const r = await rz.createSubscription({
      planId: input.standardPlanId,
      totalCount: 12,
      notes: { clinicId: input.clinicId },
    });
    const id = newId("sub");
    await tx.insert(subscriptions).values({
      id,
      clinicId: input.clinicId,
      providerSubscriptionId: r.id,
      providerPlanId: input.standardPlanId,
      status: r.status,
    });
    await tx.insert(auditLog).values({
      id: newId("aud"),
      clinicId: input.clinicId,
      actorId: input.actorUserId,
      action: "clinic.subscription.start",
      entity: "clinic",
      entityId: input.clinicId,
      data: { subscriptionId: r.id },
    });
    return { subscriptionId: id, providerSubscriptionId: r.id };
  });
}

export interface RazorpayEvent {
  id: string;
  event: string;
  subscription?: { id: string; status: string; plan_id: string; current_end?: number | null };
  raw: Record<string, unknown>;
}

const eventSchema = z.object({
  event: z.string().min(1),
  payload: z.object({
    // payment.* / order.* events carry no subscription entity: accepted and ignored.
    subscription: z
      .object({
        entity: z.object({
          id: z.string().min(1),
          status: z.string().min(1),
          plan_id: z.string().min(1),
          current_end: z.number().int().nonnegative().max(4_102_444_800).nullable().optional(),
        }),
      })
      .optional(),
  }),
});

/** `eventId` is the sha256 of the signed raw webhook body; it is the idempotency key. */
export function parseRazorpayEvent(body: unknown, eventId: string | undefined): RazorpayEvent {
  if (!eventId) throw new CoreError("validation", "missing event id");
  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) {
    const where = parsed.error.issues[0]?.path.join(".") ?? "body";
    throw new CoreError("validation", `invalid razorpay event: ${where}`);
  }
  const sub = parsed.data.payload.subscription;
  if (!sub) return { id: eventId, event: parsed.data.event, raw: body as Record<string, unknown> };
  const e = sub.entity;
  return {
    id: eventId,
    event: parsed.data.event,
    subscription: {
      id: e.id,
      status: e.status,
      plan_id: e.plan_id,
      ...(e.current_end !== undefined ? { current_end: e.current_end } : {}),
    },
    raw: body as Record<string, unknown>,
  };
}

/**
 * The plan follows the entity's `status`, not the event name: an out-of-order or late event
 * carries the subscription's state at send time, and the name alone (e.g. a late
 * `subscription.charged`) could wrongly flip the plan. Other statuses (created, pending)
 * leave the plan alone.
 */
function planForStatus(status: string): "standard" | "pilot" | null {
  switch (status) {
    case "active":
    case "authenticated":
    case "charged":
    case "resumed":
      return "standard";
    case "halted":
    case "cancelled":
    case "completed":
    case "expired":
    case "paused":
      return "pilot";
    default:
      return null;
  }
}

function subscriptionEntity(raw: Record<string, unknown>): Record<string, unknown> {
  const payload = raw["payload"] as { subscription?: { entity?: Record<string, unknown> } };
  return payload.subscription?.entity ?? {};
}

/** The only code path that changes clinics.plan. Idempotent on the provider event id. */
export async function applyRazorpayEvent(
  db: Db,
  ev: RazorpayEvent,
): Promise<"applied" | "duplicate" | "ignored"> {
  const sub = ev.subscription;
  if (!sub) return "ignored";
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(billingEvents)
      .values({
        id: ev.id,
        event: ev.event,
        subscriptionId: sub.id,
        // Only the subscription entity is kept, not the whole webhook body.
        payload: subscriptionEntity(ev.raw),
      })
      .onConflictDoNothing()
      .returning({ id: billingEvents.id });
    if (inserted.length === 0) return "duplicate";

    const [row] = await tx
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.provider, "razorpay"),
          eq(subscriptions.providerSubscriptionId, sub.id),
        ),
      );
    if (!row) return "ignored"; // the event row stays so retries are ignored too

    await tx
      .update(subscriptions)
      .set({
        status: sub.status,
        ...(sub.current_end != null ? { currentPeriodEnd: new Date(sub.current_end * 1000) } : {}),
      })
      .where(eq(subscriptions.id, row.id));

    const nextPlan = planForStatus(sub.status);
    if (nextPlan) {
      const [clinic] = await tx
        .select({ plan: clinics.plan })
        .from(clinics)
        .where(eq(clinics.id, row.clinicId))
        .for("update");
      if (clinic && clinic.plan !== nextPlan) {
        await tx.update(clinics).set({ plan: nextPlan }).where(eq(clinics.id, row.clinicId));
        await tx.insert(auditLog).values({
          id: newId("aud"),
          clinicId: row.clinicId,
          actorId: null,
          action: "clinic.plan.change",
          entity: "clinic",
          entityId: row.clinicId,
          data: { from: clinic.plan, to: nextPlan, subscriptionId: sub.id },
        });
      }
    }
    return "applied";
  });
}
