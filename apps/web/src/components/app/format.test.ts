import { describe, expect, it } from "vitest";
import {
  clockTime,
  formatClock,
  formatDate,
  formatDateLong,
  formatDayShort,
  formatDur,
  formatPhone,
  initials,
  keyDate,
  keyDateLong,
  keyDayShort,
  keyDob,
  localParts,
  minutesOfDay,
  monthShort,
  relativeDateTime,
  relativeDay,
  shortDateTime,
  validDateKey,
} from "./format";

const TZ = "Asia/Kolkata";

describe("app formats", () => {
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

  it("groups Indian mobiles and STD landlines and leaves anything else alone", () => {
    expect(formatPhone("+919845123210")).toBe("+91 98451 23210");
    expect(formatPhone("+919739014821")).toBe("+91 97390 14821");
    expect(formatPhone("+918041234567")).toBe("+91 80 4123 4567");
    expect(formatPhone("+911123456789")).toBe("+91 11 2345 6789");
    expect(formatPhone("+914712345678")).toBe("+91 471 234 5678");
    expect(formatPhone("+14155550100")).toBe("+14155550100");
    expect(formatPhone("+15550100")).toBe("+15550100");
    expect(formatPhone("+91 •••• ••3210")).toBe("+91 •••• ••3210");
    expect(formatPhone(null)).toBe("");
    expect(formatPhone(undefined)).toBe("");
  });

  it("builds initials", () => {
    expect(initials("Ananya Krishnan")).toBe("AK");
    expect(initials("Dr. Meera Rao Iyer")).toBe("DM");
    expect(initials(null)).toBe("?");
  });

  it("reads today's callbacks as Today, other days with the weekday", () => {
    expect(relativeDateTime("2026-10-09T05:14:00Z", "2026-10-09", TZ)).toBe("Today, 10:44 am");
    expect(relativeDateTime("2026-10-08T10:35:00Z", "2026-10-09", TZ)).toBe("Thu, 8 Oct, 4:05 pm");
    // 00:30 IST on the 9th is still the 8th in UTC.
    expect(relativeDateTime("2026-10-08T19:00:00Z", "2026-10-09", TZ)).toBe("Today, 12:30 am");
  });

  it("prints notification times as day and month", () => {
    expect(shortDateTime("2026-10-09T09:00:00Z", TZ)).toBe("9 Oct, 2:30 pm");
    expect(shortDateTime("2026-10-09T09:00:00Z", "Not/AZone")).toBe("9 Oct, 2:30 pm");
  });

  it("writes plan dates in the clinic's zone", () => {
    expect(formatDate("2026-10-24T20:00:00Z", TZ)).toBe("25 Oct 2026");
    expect(formatDate("2026-10-24T20:00:00Z", "America/Los_Angeles")).toBe("24 Oct 2026");
    expect(formatDate("2026-10-24T20:00:00Z", "Not/AZone")).toBe("25 Oct 2026");
    expect(formatDate("2026-10-24T20:00:00Z")).toBe("25 Oct 2026");
  });

  it("writes September as the design does, not en-IN's Sept", () => {
    expect(keyDayShort("2026-09-10")).toBe("10 Sep");
    expect(formatDate("2026-09-10T09:00:00Z", TZ)).toBe("10 Sep 2026");
    expect(shortDateTime("2026-09-10T09:00:00Z", TZ)).toBe("10 Sep, 2:30 pm");
    expect(relativeDateTime("2026-09-10T09:00:00Z", "2026-10-09", TZ)).toBe("Thu, 10 Sep, 2:30 pm");
    expect(monthShort("2026-09")).toBe("Sep");
    expect(monthShort("2026-10")).toBe("Oct");
  });
});
