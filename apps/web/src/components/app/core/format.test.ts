import { describe, expect, it } from "vitest";
import {
  clockTime,
  formatClock,
  formatDateLong,
  formatDayShort,
  formatDur,
  formatPhone,
  initials,
  keyDate,
  keyDateLong,
  keyDob,
  localParts,
  minutesOfDay,
  relativeDay,
  validDateKey,
} from "./format";

const TZ = "Asia/Kolkata";

describe("core formats", () => {
  it("accepts only real calendar dates as date keys", () => {
    expect(validDateKey("2026-10-09")).toBe("2026-10-09");
    expect(validDateKey("2028-02-29")).toBe("2028-02-29");
    expect(validDateKey("2026-13-45")).toBeUndefined();
    expect(validDateKey("2026-02-30")).toBeUndefined();
    expect(validDateKey("2026-1-9")).toBeUndefined();
    expect(validDateKey(undefined)).toBeUndefined();
  });

  it("reads instants in the clinic timezone", () => {
    // 20:14 IST on 8 Oct is 14:44 UTC.
    const p = localParts("2026-10-08T14:44:00Z", TZ);
    expect(p).toMatchObject({ key: "2026-10-08", hour: 20, minute: 14, weekday: 4 });
    expect(minutesOfDay("2026-10-08T14:44:00Z", TZ)).toBe(20 * 60 + 14);
    expect(localParts("2026-10-08T19:00:00Z", TZ).key).toBe("2026-10-09");
  });

  it("writes dates the way the design does", () => {
    expect(formatDateLong("2026-10-08T14:44:00Z", TZ)).toBe("Thu, 8 Oct 2026");
    expect(formatDayShort("2026-10-08T14:44:00Z", TZ)).toBe("8 Oct");
    expect(keyDateLong("2026-10-09")).toBe("Fri, 9 Oct 2026");
    expect(keyDate("2026-10-12")).toBe("Mon, 12 Oct");
    expect(keyDob("1994-03-12")).toBe("12 Mar 1994");
    expect(relativeDay("2026-10-09T08:22:00Z", "2026-10-09", TZ)).toBe("Today");
    expect(relativeDay("2026-10-08T14:44:00Z", "2026-10-09", TZ)).toBe("Thu, 8 Oct");
  });

  it("writes durations and clocks with minutes", () => {
    expect(formatDur(21)).toBe("0m 21s");
    expect(formatDur(135)).toBe("2m 15s");
    expect(formatDur(null)).toBe("–");
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(80.6)).toBe("1:20");
    expect(clockTime(10 * 60)).toBe("10:00 am");
    expect(clockTime(12 * 60 + 30)).toBe("12:30 pm");
    expect(clockTime(20 * 60)).toBe("8:00 pm");
  });

  it("groups a revealed Indian number and builds initials", () => {
    expect(formatPhone("+919845123210")).toBe("+91 98451 23210");
    expect(formatPhone("+918041234567")).toBe("+91 80 4123 4567");
    expect(formatPhone("+15550100")).toBe("+15550100");
    expect(initials("Ananya Krishnan")).toBe("AK");
    expect(initials("Dr. Meera Rao Iyer")).toBe("DM");
    expect(initials(null)).toBe("?");
  });
});
