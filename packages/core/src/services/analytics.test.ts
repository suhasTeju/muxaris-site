import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newId, schema } from "@muxaris/db";
import { getCallAnalytics, getMonthlyUsage, localDayWindow } from "./analytics.js";
import { recordCallUsage } from "./usage.js";
import { dbReachable, makeTestClinic, openDb, warnIfUnreachable } from "./test-support.js";

const reachable = await dbReachable();
warnIfUnreachable(reachable, "analytics");
const { db, pool } = openDb();

describe("localDayWindow", () => {
  it("spans [start of from, start of day after to) in the clinic zone", () => {
    const w = localDayWindow("2026-09-10", "2026-09-11", "Asia/Kolkata");
    expect(w.start.toISOString()).toBe("2026-09-09T18:30:00.000Z");
    expect(w.end.toISOString()).toBe("2026-09-11T18:30:00.000Z");
  });

  it("rejects inverted and oversized ranges", () => {
    expect(() => localDayWindow("2026-09-11", "2026-09-10", "Asia/Kolkata")).toThrow(
      /must not be before/,
    );
    expect(() => localDayWindow("2026-01-01", "2026-06-01", "Asia/Kolkata")).toThrow(/92 days/);
  });
});

(reachable ? describe : describe.skip)("analytics", () => {
  let c: Awaited<ReturnType<typeof makeTestClinic>>;
  beforeAll(async () => {
    c = await makeTestClinic(db, "analytics");
  });
  afterAll(async () => {
    await c.cleanup();
    await pool.end();
  });

  const row = (startedAt: string, outcome: "booked" | "info", lang: string | null, dur: number) => {
    const s = new Date(startedAt);
    return {
      id: newId("call"),
      clinicId: c.clinic.id,
      channel: "browser" as const,
      status: "completed" as const,
      startedAt: s,
      endedAt: new Date(s.getTime() + dur * 1000),
      durationS: dur,
      outcome,
      languageDetected: lang,
    };
  };

  it("aggregates calls by outcome, language, local hour and day, with booking conversion", async () => {
    await db
      .insert(schema.calls)
      .values([
        row("2026-09-10T04:30:00Z", "booked", "kn-IN", 120),
        row("2026-09-10T13:30:00Z", "info", "en-IN", 60),
        row("2026-09-11T05:00:00Z", "booked", null, 90),
      ]);
    const a = await getCallAnalytics(db, c.clinic.id, {
      from: "2026-09-10",
      to: "2026-09-11",
      timezone: "Asia/Kolkata",
    });
    expect(a.totalCalls).toBe(3);
    expect(a.bookedCalls).toBe(2);
    expect(a.bookingConversion).toBeCloseTo(2 / 3);
    expect(a.byOutcome).toEqual({ booked: 2, info: 1 });
    expect(a.byLanguage).toEqual({ "kn-IN": 1, "en-IN": 1, unknown: 1 });
    expect(a.byHour[10]).toBe(2);
    expect(a.byHour[19]).toBe(1);
    expect(a.byDay).toEqual([
      { date: "2026-09-10", calls: 2, booked: 1 },
      { date: "2026-09-11", calls: 1, booked: 1 },
    ]);
    expect(a.avgDurationS).toBe(90);
  });

  it("is scoped to the clinic and zero-fills empty days", async () => {
    const other = await makeTestClinic(db, "analytics-other");
    try {
      const a = await getCallAnalytics(db, other.clinic.id, {
        from: "2026-09-10",
        to: "2026-09-12",
        timezone: "Asia/Kolkata",
      });
      expect(a.totalCalls).toBe(0);
      expect(a.bookingConversion).toBe(0);
      expect(a.avgDurationS).toBeNull();
      expect(a.byDay.map((d) => d.calls)).toEqual([0, 0, 0]);
      expect(a.byHour).toHaveLength(24);
    } finally {
      await other.cleanup();
    }
  });

  it("returns no months when asked for fewer than one", async () => {
    expect(await getMonthlyUsage(db, c.clinic.id, 0)).toEqual([]);
  });

  it("zero-fills monthly usage, oldest first", async () => {
    await recordCallUsage(db, { clinicId: c.clinic.id, month: "2026-07", callSeconds: 600 });
    const m = await getMonthlyUsage(
      db,
      c.clinic.id,
      3,
      new Date("2026-09-15T00:00:00Z"),
      "Asia/Kolkata",
    );
    expect(m.map((x) => x.month)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(m[0]).toMatchObject({ callSeconds: 600, calls: 1 });
    expect(m[1]).toMatchObject({ callSeconds: 0, calls: 0 });
  });
});
