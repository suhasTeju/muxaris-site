import { and, eq, sql } from "drizzle-orm";
import { schema, type Db } from "@muxaris/db";
import { CoreError } from "./errors.js";

const { plans, clinics, usageLedger } = schema;

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

/** Atomically adds one finished call to the month's ledger. */
export async function recordCallUsage(
  db: Db,
  input: { clinicId: string; month: string; callSeconds: number },
) {
  const seconds = Math.max(0, Math.round(input.callSeconds));
  await db
    .insert(usageLedger)
    .values({ clinicId: input.clinicId, month: input.month, callSeconds: seconds, calls: 1 })
    .onConflictDoUpdate({
      target: [usageLedger.clinicId, usageLedger.month],
      set: {
        callSeconds: sql`${usageLedger.callSeconds} + excluded.call_seconds`,
        calls: sql`${usageLedger.calls} + excluded.calls`,
      },
    });
}
