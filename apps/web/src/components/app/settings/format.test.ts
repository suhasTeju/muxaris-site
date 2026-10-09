import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import {
  formatPhone,
  hoursForSave,
  hoursSummary,
  languageName,
  rupee,
  saveErrorText,
  timezoneLabel,
  weekFromHours,
} from "./format";

const h = (weekday: number, startTime = "10:00", endTime = "20:00") => ({
  weekday,
  startTime,
  endTime,
});

describe("settings format helpers", () => {
  it("formats phones, rupees, languages and the timezone", () => {
    expect(formatPhone("+918041234567")).toBe("+91 80 4123 4567");
    expect(formatPhone("+14155550100")).toBe("+14155550100");
    expect(formatPhone(null)).toBe("");
    expect(rupee(150000)).toBe("₹1,50,000");
    expect(languageName("kn-IN")).toBe("Kannada");
    expect(languageName("xx-XX")).toBe("xx-XX");
    expect(timezoneLabel("Asia/Kolkata")).toMatch(/^Asia\/Kolkata( \(.+\))?$/);
    expect(timezoneLabel("Not/AZone")).toBe("Not/AZone");
  });

  it("summarises working hours", () => {
    expect(hoursSummary([1, 2, 3, 4, 5, 6].map((d) => h(d)))).toBe("Mon–Sat 10:00–20:00");
    expect(hoursSummary([h(3, "09:00", "13:00")])).toBe("Wed 09:00–13:00");
    expect(hoursSummary([h(1), h(3)])).toBe("2 days a week");
    expect(hoursSummary([h(1), h(2, "09:00")])).toBe("2 days a week");
    expect(hoursSummary([])).toBe("No working hours");
  });

  it("collapses split shifts to the day's span and flags them", () => {
    const { week, split } = weekFromHours([h(1, "09:00", "13:00"), h(1, "16:00", "24:00"), h(2)]);
    expect(split).toBe(true);
    expect(week[1]).toEqual({ open: true, start: "09:00", end: "23:59" });
    expect(week[0]!.open).toBe(false);
    expect(hoursSummary([h(1, "09:00", "13:00"), h(1, "16:00", "20:00")])).toBe("1 day a week");
  });

  it("saves an edited week without touching the days that were left alone", () => {
    const rows = [
      h(1, "09:00", "13:00"),
      h(1, "16:00", "20:00"),
      h(2, "18:00", "24:00"),
      h(3, "18:00", "24:00"),
      h(5),
    ];
    const { week } = weekFromHours(rows);
    // Unchanged: split shifts and 24:00 closes are re-sent exactly as stored.
    expect(hoursForSave(rows, week)).toEqual(rows);
    const edited = week.map((d, i) =>
      i === 3
        ? { ...d, start: "17:00" }
        : i === 5
          ? { ...d, open: false }
          : i === 6
            ? { open: true, start: "09:00", end: "13:00" }
            : d,
    );
    expect(hoursForSave(rows, edited)).toEqual([
      h(1, "09:00", "13:00"),
      h(1, "16:00", "20:00"),
      h(2, "18:00", "24:00"),
      // A changed day that still shows 23:59 for a stored 24:00 close keeps 24:00.
      h(3, "17:00", "24:00"),
      h(6, "09:00", "13:00"),
    ]);
    // A changed split day saves as one shift.
    const flat = week.map((d, i) => (i === 1 ? { ...d, start: "08:00" } : d));
    expect(hoursForSave(rows, flat).filter((r) => r.weekday === 1)).toEqual([
      h(1, "08:00", "20:00"),
    ]);
    // A new doctor has no stored rows: every open day is sent.
    expect(hoursForSave([], week)).toEqual([
      h(1, "09:00", "20:00"),
      h(2, "18:00", "23:59"),
      h(3, "18:00", "23:59"),
      h(5),
    ]);
  });

  it("turns API errors into short save messages", () => {
    expect(saveErrorText(new ApiError(403, "forbidden", "owner role required"))).toBe(
      "Only the clinic owner can change this.",
    );
    expect(saveErrorText(new ApiError(400, "validation", "bad"))).toBe(
      "Some values were not accepted. Check them and try again.",
    );
    expect(saveErrorText(new ApiError(404, "not_found", "gone"))).toBe(
      "This item no longer exists. Refresh the page.",
    );
    expect(saveErrorText(new Error("boom"))).toBe("Could not save the changes. Try again.");
  });
});
