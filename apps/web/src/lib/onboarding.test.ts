import { describe, expect, it } from "vitest";
import { LANGUAGE_CODES } from "@muxaris/shared";
import {
  GREETING_TEMPLATES,
  STEPS,
  copyMondayToAll,
  defaultWeekHours,
  fillGreeting,
  nextStep,
  prevStep,
  resumeStep,
  validateWeekHours,
  weekHoursPayload,
} from "./onboarding";

describe("greeting templates", () => {
  it("fills the clinic name for all five languages", () => {
    for (const code of LANGUAGE_CODES) {
      const g = fillGreeting(code, "Sunrise Dental Care");
      expect(g).toContain("Sunrise Dental Care");
      expect(g).not.toContain("{clinic}");
    }
    expect(Object.keys(GREETING_TEMPLATES)).toHaveLength(5);
    expect(fillGreeting("en-IN", "Sunrise")).toBe(
      "Hello, welcome to Sunrise. How may I help you today?",
    );
    expect(fillGreeting("hi-IN", "Sunrise")).toBe(
      "नमस्ते, Sunrise में आपका स्वागत है। बताइए, हम आपकी कैसे मदद कर सकते हैं?",
    );
  });
  it("fits the 300 character API limit", () => {
    for (const code of LANGUAGE_CODES)
      expect(fillGreeting(code, "x".repeat(60)).length).toBeLessThanOrEqual(300);
  });
});

describe("step helpers", () => {
  it("orders steps and clamps at the ends", () => {
    expect(STEPS).toEqual(["basics", "doctors", "services", "assistant", "review", "done"]);
    expect(nextStep("basics")).toBe("doctors");
    expect(nextStep("review")).toBe("done");
    expect(nextStep("done")).toBe("done");
    expect(prevStep("services")).toBe("doctors");
    expect(prevStep("basics")).toBe("basics");
  });
  it("resumes at basics without a clinic or with an unknown step", () => {
    expect(resumeStep("services", true)).toBe("services");
    expect(resumeStep("services", false)).toBe("basics");
    expect(resumeStep("bogus", true)).toBe("basics");
    expect(resumeStep(null, true)).toBe("basics");
  });
});

describe("working hours", () => {
  it("defaults to Mon-Sat 10-20 with Sunday closed", () => {
    const w = defaultWeekHours();
    expect(w[0]!.open).toBe(false);
    expect(w.slice(1).every((d) => d.open && d.start === "10:00" && d.end === "20:00")).toBe(true);
    expect(weekHoursPayload(w)).toHaveLength(6);
    expect(weekHoursPayload(w)[0]).toEqual({ weekday: 1, startTime: "10:00", endTime: "20:00" });
  });
  it("validates end after start on open days only", () => {
    const w = defaultWeekHours();
    expect(validateWeekHours(w)).toEqual({});
    w[2] = { open: true, start: "12:00", end: "12:00" };
    w[0] = { open: false, start: "15:00", end: "09:00" };
    expect(Object.keys(validateWeekHours(w))).toEqual(["2"]);
  });
  it("copies Monday to every day", () => {
    const w = defaultWeekHours();
    w[1] = { open: true, start: "09:00", end: "17:30" };
    const c = copyMondayToAll(w);
    expect(c.every((d) => d.open && d.start === "09:00" && d.end === "17:30")).toBe(true);
    c[3]!.start = "11:00";
    expect(c[1]!.start).toBe("09:00");
  });
});
