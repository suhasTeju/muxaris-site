import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { schema } from "@muxaris/db";
import { createCall } from "./calls.js";
import { pilotEndsAt, recordCallUsage, usageMonth } from "./usage.js";
import { dbReachable, makeTestClinic, openDb, warnIfUnreachable } from "./test-support.js";

const reachable = await dbReachable();
warnIfUnreachable(reachable, "usage");
const { db, pool } = openDb();

describe("pilotEndsAt", () => {
  it("is 30 days after the clinic was created", () => {
    expect(pilotEndsAt(new Date("2026-10-05T10:00:00Z")).toISOString()).toBe(
      "2026-11-04T10:00:00.000Z",
    );
  });
});

(reachable ? describe : describe.skip)("recordCallUsage", () => {
  let c: Awaited<ReturnType<typeof makeTestClinic>>;
  beforeAll(async () => {
    c = await makeTestClinic(db, "usage");
  });
  afterAll(async () => {
    await c.cleanup();
    await pool.end();
  });

  it("adds seconds, calls and tokens to the month row", async () => {
    const month = "2026-02";
    await recordCallUsage(db, {
      callId: (await createCall(db, { clinicId: c.clinic.id, channel: "browser" })).id,
      clinicId: c.clinic.id,
      month,
      callSeconds: 61,
      llmInputTokens: 100,
      llmOutputTokens: 40,
    });
    await recordCallUsage(db, {
      callId: (await createCall(db, { clinicId: c.clinic.id, channel: "browser" })).id,
      clinicId: c.clinic.id,
      month,
      callSeconds: 30,
    });
    const [row] = await db
      .select()
      .from(schema.usageLedger)
      .where(
        and(eq(schema.usageLedger.clinicId, c.clinic.id), eq(schema.usageLedger.month, month)),
      );
    expect(row).toMatchObject({
      callSeconds: 91,
      calls: 2,
      llmInputTokens: 100,
      llmOutputTokens: 40,
    });
  });

  it("records usage against the month the call started", () => {
    // 2026-10-31 23:50 IST started, ended after midnight: the key is October.
    expect(usageMonth("Asia/Kolkata", new Date("2026-10-31T18:20:00Z"))).toBe("2026-10");
    expect(usageMonth("Asia/Kolkata", new Date("2026-10-31T18:40:00Z"))).toBe("2026-11");
  });

  it("records a call's usage exactly once", async () => {
    const month = "2026-03";
    const call = await createCall(db, { clinicId: c.clinic.id, channel: "browser" });
    const input = { callId: call.id, clinicId: c.clinic.id, month, callSeconds: 60 };
    expect(await recordCallUsage(db, input)).toEqual({ recorded: true });
    expect(await recordCallUsage(db, input)).toEqual({ recorded: false });
    const [row] = await db
      .select()
      .from(schema.usageLedger)
      .where(
        and(eq(schema.usageLedger.clinicId, c.clinic.id), eq(schema.usageLedger.month, month)),
      );
    expect(row).toMatchObject({ calls: 1, callSeconds: 60 });
  });
});
