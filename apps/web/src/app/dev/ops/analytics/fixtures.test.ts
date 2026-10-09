import { describe, expect, it } from "vitest";
import { analyticsFor, monthsFor } from "./fixtures";

describe("analytics preview fixtures", () => {
  it("reproduce the prototype's 30-day numbers", () => {
    const a = analyticsFor(30);
    expect([a.from, a.to]).toEqual(["2026-09-10", "2026-10-09"]);
    expect(a.totalCalls).toBe(275);
    expect(a.bookedCalls).toBe(125);
    expect(Math.round(a.bookingConversion * 100)).toBe(45);
    expect(a.avgDurationS).toBe(87);
    expect(a.byLanguage).toEqual({
      "en-IN": 94,
      "kn-IN": 74,
      "hi-IN": 50,
      "ta-IN": 30,
      "te-IN": 28,
    });
    expect(a.byOutcome["info"]).toBe(61);
    expect(a.byDay).toHaveLength(30);
    expect(a.byHour).toHaveLength(24);
  });

  it("end the months on this month's minutes", () => {
    expect(monthsFor(1842).map((m) => m.callSeconds / 60)).toEqual([
      1240, 1610, 1980, 2240, 2710, 1842,
    ]);
  });
});
