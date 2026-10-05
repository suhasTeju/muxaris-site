import { and, eq, sql } from "drizzle-orm";
import { schema, type Db } from "@muxaris/db";
import { CoreError } from "./errors.js";

const { plans, clinics, usageLedger, calls } = schema;

/** "YYYY-MM" for `at` in the given IANA timezone (the usage_ledger month key). */
export function usageMonth(timezone: string, at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}`;
}

/** The plan row (limits) for a clinic. */
export async function getPlanForClinic(db: Db, clinicId: string) {
  const [row] = await db
    .select({ plan: plans })
    .from(clinics)
    .innerJoin(plans, sql`${plans.id} = ${clinics.plan}::text`)
    .where(eq(clinics.id, clinicId));
  if (!row) throw new CoreError("not_found", "plan not found");
  return row.plan;
}

/** Call seconds already used in `month` ("YYYY-MM"); 0 when there is no ledger row. */
export async function getUsedCallSeconds(db: Db, clinicId: string, month: string) {
  const [row] = await db
    .select({ callSeconds: usageLedger.callSeconds })
    .from(usageLedger)
    .where(and(eq(usageLedger.clinicId, clinicId), eq(usageLedger.month, month)));
  return row?.callSeconds ?? 0;
}

export const PILOT_DAYS = 30;
/** When a pilot clinic's 30 days end. Shown, not enforced, until the clinic can pay. */
export function pilotEndsAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + PILOT_DAYS * 86_400_000);
}

export type UsageDb = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export type CallUsageInput = {
  callId: string;
  clinicId: string;
  month: string;
  callSeconds: number;
  llmInputTokens?: number;
  llmOutputTokens?: number;
};

/**
 * Adds one finished call to the month's ledger, at most once per call: the `calls` row is
 * claimed via `usage_recorded_at` and the ledger upserted in the same transaction. Returns
 * `{ recorded: false }` (writing nothing) when the call's usage was already recorded.
 */
export async function recordCallUsage(
  db: Db,
  input: CallUsageInput,
): Promise<{ recorded: boolean }> {
  return db.transaction((tx) => recordCallUsageIn(tx, input));
}

/** Same as {@link recordCallUsage}, for callers already inside a transaction. */
export async function recordCallUsageIn(
  db: UsageDb,
  input: CallUsageInput,
): Promise<{ recorded: boolean }> {
  const claimed = await db
    .update(calls)
    .set({ usageRecordedAt: sql`now()` })
    .where(
      and(
        eq(calls.id, input.callId),
        eq(calls.clinicId, input.clinicId),
        sql`${calls.usageRecordedAt} IS NULL`,
      ),
    )
    .returning({ id: calls.id });
  if (claimed.length === 0) return { recorded: false };
  const seconds = Math.max(0, Math.round(input.callSeconds));
  const inTok = Math.max(0, Math.round(input.llmInputTokens ?? 0));
  const outTok = Math.max(0, Math.round(input.llmOutputTokens ?? 0));
  await db
    .insert(usageLedger)
    .values({
      clinicId: input.clinicId,
      month: input.month,
      callSeconds: seconds,
      calls: 1,
      llmInputTokens: inTok,
      llmOutputTokens: outTok,
    })
    .onConflictDoUpdate({
      target: [usageLedger.clinicId, usageLedger.month],
      set: {
        callSeconds: sql`${usageLedger.callSeconds} + excluded.call_seconds`,
        calls: sql`${usageLedger.calls} + excluded.calls`,
        llmInputTokens: sql`${usageLedger.llmInputTokens} + excluded.llm_input_tokens`,
        llmOutputTokens: sql`${usageLedger.llmOutputTokens} + excluded.llm_output_tokens`,
      },
    });
  return { recorded: true };
}
