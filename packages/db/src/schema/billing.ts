import { pgTable, text, integer, primaryKey } from "drizzle-orm/pg-core";
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
