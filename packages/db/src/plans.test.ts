import { describe, expect, it } from "vitest";
import pg from "pg";
import { count, eq } from "drizzle-orm";
import { createDb } from "./client.js";
import { schema } from "./index.js";

const url = process.env.DATABASE_URL ?? "postgres://muxaris:muxaris@localhost:5433/muxaris";
async function reachable() {
  const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 2000 });
  try {
    await c.connect();
    return true;
  } catch {
    return false;
  } finally {
    await c.end().catch(() => undefined);
  }
}
const ok = await reachable();
if (!ok) console.warn("WARNING: Postgres unreachable, skipping plans migration test.");

(ok ? describe : describe.skip)("plans are present after migrations, without the demo seed", () => {
  it("has pilot and standard with the marketed limits", async () => {
    const { db, pool } = createDb(url);
    try {
      const [pilot] = await db.select().from(schema.plans).where(eq(schema.plans.id, "pilot"));
      const [std] = await db.select().from(schema.plans).where(eq(schema.plans.id, "standard"));
      expect(pilot).toMatchObject({
        includedCallMinutes: 500,
        priceInrMonthly: 0,
        maxConcurrentCalls: 2,
      });
      expect(std).toMatchObject({
        includedCallMinutes: 3000,
        priceInrMonthly: 4999,
        maxConcurrentCalls: 5,
      });
      expect(std?.features).toEqual([
        "ai_receptionist",
        "dashboard",
        "email_confirmations",
        "reminders",
      ]);
      // the table exists (a shared dev database may hold subscription rows)
      await expect(db.select({ n: count() }).from(schema.subscriptions)).resolves.toHaveLength(1);
    } finally {
      await pool.end();
    }
  });
});
