import { describe, expect, it } from "vitest";
import { LANGUAGE_CODES, NOTIFICATION_KINDS } from "@muxaris/shared";
import {
  formatWhen,
  renderNotification,
  templateLanguage,
  type TemplateVars,
} from "./templates.js";

const vars: TemplateVars = {
  patientName: "Ravi",
  clinicName: "Sunrise Dental",
  doctorName: "Dr. Rao",
  serviceName: "Cleaning",
  when: "Mon, 6 Oct 2026, 11:00 am",
  clinicPhone: "+918040001234",
};

describe("notification templates", () => {
  it("renders every kind in every language with the variables filled", () => {
    for (const lang of LANGUAGE_CODES) {
      for (const kind of NOTIFICATION_KINDS) {
        const r = renderNotification(kind, lang, vars);
        expect(r.subject.length, `${lang}/${kind} subject`).toBeGreaterThan(5);
        expect(r.body, `${lang}/${kind} body`).toContain("Sunrise Dental");
        expect(r.body).toContain(vars.when);
        expect(r.body).not.toMatch(/\{[a-z]+\}/);
        expect(r.subject).not.toMatch(/\{[a-z]+\}/);
        // subjects never carry the patient's name
        expect(r.subject).not.toContain("Ravi");
      }
    }
  });
  it("greets by name when known and omits it otherwise", () => {
    expect(renderNotification("appointment_confirmed", "en-IN", vars).body).toMatch(
      /^Namaste Ravi\./,
    );
    expect(
      renderNotification("appointment_confirmed", "en-IN", { ...vars, patientName: null }).body,
    ).toMatch(/^Namaste\./);
  });
  it("includes the clinic phone only when present", () => {
    expect(renderNotification("appointment_confirmed", "hi-IN", vars).body).toContain(
      "+918040001234",
    );
    expect(
      renderNotification("appointment_confirmed", "hi-IN", { ...vars, clinicPhone: null }).body,
    ).not.toContain("+91");
  });
  it("formats times in the clinic zone and language", () => {
    const at = new Date("2026-10-06T05:30:00Z");
    expect(formatWhen(at, "Asia/Kolkata", "en-IN")).toMatch(/6 Oct,? 2026/);
    expect(formatWhen(at, "Asia/Kolkata", "en-IN")).toMatch(/11:00/);
    expect(formatWhen(at, "Asia/Kolkata", "hi-IN")).toMatch(/2026/);
  });
  it("falls back to English for unknown codes", () => {
    expect(templateLanguage("fr-FR")).toBe("en-IN");
    expect(templateLanguage("ta-IN")).toBe("ta-IN");
    expect(templateLanguage(null)).toBe("en-IN");
  });
});
