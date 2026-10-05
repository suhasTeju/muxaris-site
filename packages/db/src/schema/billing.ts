import {
  pgTable,
  text,
  integer,
  primaryKey,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { clinics } from "./tenancy.js";
export const plans = pgTable("plans", {
  id: text("id").primaryKey(), // "pilot" | "standard"
  name: text("name").notNull(),
  priceInrMonthly: integer("price_inr_monthly").notNull(),
  includedCallMinutes: integer("included_call_minutes").notNull(),
  maxConcurrentCalls: integer("max_concurrent_calls").notNull().default(2),
  features: text("features").array().notNull().default([]),
});
export const usageLedger = pgTable(
  "usage_ledger",
  {
    clinicId: text("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    month: text("month").notNull(), // "2026-10"
    callSeconds: integer("call_seconds").notNull().default(0),
    calls: integer("calls").notNull().default(0),
    llmInputTokens: integer("llm_input_tokens").notNull().default(0),
    llmOutputTokens: integer("llm_output_tokens").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.clinicId, t.month] })],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id").primaryKey(), // "sub_…" via newId("sub")
    clinicId: text("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("razorpay"),
    providerSubscriptionId: text("provider_subscription_id").notNull(),
    providerPlanId: text("provider_plan_id").notNull(),
    // created | authenticated | active | halted | cancelled | completed | expired (Razorpay states)
    status: text("status").notNull().default("created"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("subscriptions_provider_sub_uq").on(t.provider, t.providerSubscriptionId),
    index("subscriptions_clinic_idx").on(t.clinicId),
  ],
);

/** One row per provider event id: the webhook's idempotency ledger. */
export const billingEvents = pgTable("billing_events", {
  id: text("id").primaryKey(), // provider event id (Razorpay `x-razorpay-event-id`)
  provider: text("provider").notNull().default("razorpay"),
  event: text("event").notNull(),
  subscriptionId: text("subscription_id"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
});
