import { describe, expect, it } from "vitest";
import type { Appointment } from "@muxaris/shared";
import {
  addDays,
  dayRange,
  formatDuration,
  formatTime,
  groupByDoctor,
  languageLabel,
  localDateKey,
  maskPhone,
  safeTz,
  startOfLocalDay,
} from "./dashboard";

const appt = (id: string, doctorId: string, startsAt: string): Appointment =>
  ({ id, doctorId, startsAt }) as Appointment;

describe("time formatting", () => {
  it("formats in the clinic timezone, 12-hour with lowercase am/pm", () => {
    expect(formatTime("2026-10-06T04:00:00Z", "Asia/Kolkata")).toBe("9:30 am");
    expect(formatTime("2026-10-06T12:15:00Z", "Asia/Kolkata")).toBe("5:45 pm");
  });
  it("defaults to Asia/Kolkata and survives a bad timezone", () => {
    expect(formatTime("2026-10-06T04:00:00Z")).toBe("9:30 am");
    expect(formatTime("2026-10-06T04:00:00Z", "Bogus/Zone")).toBe("9:30 am");
    expect(safeTz("America/Los_Angeles")).toBe("America/Los_Angeles");
    expect(safeTz("Bogus/Zone")).toBe("Asia/Kolkata");
    expect(safeTz(undefined)).toBe("Asia/Kolkata");
  });
  it("derives the local date and day boundaries", () => {
    expect(localDateKey("2026-10-05T20:00:00Z", "Asia/Kolkata")).toBe("2026-10-06");
    expect(startOfLocalDay("2026-10-06", "Asia/Kolkata").toISOString()).toBe(
      "2026-10-05T18:30:00.000Z",
    );
    expect(dayRange("2026-10-06", 7, "Asia/Kolkata")).toEqual({
      from: "2026-10-05T18:30:00.000Z",
      to: "2026-10-12T18:30:00.000Z",
    });
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("formats durations and masks phones", () => {
    expect(formatDuration(125)).toBe("2m 05s");
    expect(formatDuration(42)).toBe("42s");
    expect(formatDuration(null)).toBe("-");
    expect(maskPhone("+919876543210")).toBe("+91 •••• ••3210");
  });
  it("names languages, or shows the code when unknown", () => {
    expect(languageLabel("kn-IN")).toBe("Kannada");
    expect(languageLabel("xx-XX")).toBe("xx-XX");
  });
});

describe("groupByDoctor", () => {
  it("groups in doctor order, sorts by time and appends unknown doctors", () => {
    const groups = groupByDoctor(
      [
        appt("a3", "d2", "2026-10-06T06:00:00Z"),
        appt("a1", "d1", "2026-10-06T08:00:00Z"),
        appt("a2", "d1", "2026-10-06T04:00:00Z"),
        appt("a4", "gone", "2026-10-06T05:00:00Z"),
      ],
      [
        { id: "d1", name: "Dr. Rao", color: "#16a34a" },
        { id: "d2", name: "Dr. Iyer", color: "#2563eb" },
        { id: "d3", name: "Dr. Empty", color: "#000000" },
      ],
    );
    expect(groups.map((g) => g.doctorName)).toEqual(["Dr. Rao", "Dr. Iyer", "Unassigned"]);
    expect(groups[0]!.items.map((a) => a.id)).toEqual(["a2", "a1"]);
  });
});
