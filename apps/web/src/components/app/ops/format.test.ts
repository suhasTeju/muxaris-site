import { describe, expect, it } from "vitest";
import { callbackWhen, displayPhone, shortWhen } from "./format";

describe("ops formatters", () => {
  it("reads today's callbacks as Today, other days with the weekday", () => {
    expect(callbackWhen("2026-10-09T05:14:00Z", "Asia/Kolkata", "2026-10-09")).toBe(
      "Today, 10:44 am",
    );
    expect(callbackWhen("2026-10-08T10:35:00Z", "Asia/Kolkata", "2026-10-09")).toBe(
      "Thu, 8 Oct, 4:05 pm",
    );
  });

  it("uses the clinic's day, not UTC's, for Today", () => {
    // 00:30 IST on the 9th is still the 8th in UTC.
    expect(callbackWhen("2026-10-08T19:00:00Z", "Asia/Kolkata", "2026-10-09")).toBe(
      "Today, 12:30 am",
    );
  });

  it("prints notification times as day and month", () => {
    expect(shortWhen("2026-10-09T09:00:00Z", "Asia/Kolkata")).toBe("9 Oct, 2:30 pm");
    expect(shortWhen("2026-10-09T09:00:00Z", "Not/AZone")).toBe("9 Oct, 2:30 pm");
  });

  it("groups Indian mobiles and STD landlines and leaves anything else alone", () => {
    expect(displayPhone("+919739014821")).toBe("+91 97390 14821");
    expect(displayPhone("+918041234567")).toBe("+91 80 4123 4567");
    expect(displayPhone("+911123456789")).toBe("+91 11 2345 6789");
    expect(displayPhone("+914712345678")).toBe("+91 471 234 5678");
    expect(displayPhone("+14155550100")).toBe("+14155550100");
  });
});
