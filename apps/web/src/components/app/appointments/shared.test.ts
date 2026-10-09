import { describe, expect, it } from "vitest";
import type { Appointment } from "@muxaris/shared";
import { dayHours } from "./DayTimeline";
import { mondayOf } from "./WeekGrid";
import { doctorColor, doctorInitials, isPast, timeRange } from "./shared";

const TZ = "Asia/Kolkata";
const at = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`).toISOString();
const appt = (start: string, end: string) =>
  ({ startsAt: at("2026-10-09", start), endsAt: at("2026-10-09", end) }) as Appointment;

describe("appointment calendar helpers", () => {
  it("labels a time range the way the design does", () => {
    expect(timeRange(appt("10:00", "10:30"), TZ)).toBe("10:00 – 10:30 am");
    expect(timeRange(appt("11:00", "12:00"), TZ)).toBe("11:00 – 12:00 pm");
  });

  it("derives doctor initials and a usable colour", () => {
    expect(doctorInitials("Dr. Meera Rao")).toBe("MR");
    expect(doctorInitials("Arjun Shetty")).toBe("AS");
    expect(doctorColor("#7b6fd6", 0)).toBe("#7b6fd6");
    expect(doctorColor(null, 1)).toBe("#7b6fd6");
    expect(doctorColor("teal", 0)).toBe("#0e9a96");
  });

  it("knows when a visit has ended", () => {
    const a = appt("10:00", "10:30");
    expect(isPast(a, new Date(at("2026-10-09", "10:30")))).toBe(true);
    expect(isPast(a, new Date(at("2026-10-09", "10:29")))).toBe(false);
  });

  it("starts weeks on Monday", () => {
    expect(mondayOf("2026-10-09", 5)).toBe("2026-10-05");
    expect(mondayOf("2026-10-11", 0)).toBe("2026-10-05");
    expect(mondayOf("2026-10-05", 1)).toBe("2026-10-05");
  });

  it("spans the doctors' hours, widened to whole hours around outlying appointments", () => {
    const doctors = [
      {
        id: "d1",
        name: "Dr. A",
        color: "#0e9a96",
        active: true,
        workingHours: [{ weekday: 5, startTime: "10:00", endTime: "20:00" }],
      },
    ];
    expect(dayHours("2026-10-09", doctors, [], TZ)).toEqual({ start: 600, end: 1200 });
    expect(dayHours("2026-10-09", doctors, [appt("08:30", "09:00")], TZ)).toEqual({
      start: 480,
      end: 1200,
    });
    expect(dayHours("2026-10-09", [], [], TZ)).toEqual({ start: 600, end: 1200 });
    expect(dayHours("2026-10-09", doctors, [appt("20:15", "21:10")], TZ).end).toBe(1320);
  });
});
