import { describe, it, expect } from "vitest";
import {
  appointmentBody,
  assistantProfileBody,
  createClinicBody,
  doctorBody,
  patientBody,
  rescheduleBody,
  serviceBody,
  slotRulesBody,
  workingHoursBody,
} from "./api.js";

describe("api bodies", () => {
  it("createClinicBody", () => {
    expect(
      createClinicBody.parse({ name: "Smile", city: "Mysuru", phone: "9876543210" }).phone,
    ).toBe("+919876543210");
    expect(
      createClinicBody.safeParse({ name: "Smile", city: "Mysuru", phone: "1234567890" }).success,
    ).toBe(false);
  });
  it("patientBody normalises phone", () => {
    expect(patientBody.parse({ phone: "+919876543210" }).phone).toBe("+919876543210");
    expect(patientBody.parse({ phone: "6000000000" }).phone).toBe("+916000000000");
    expect(patientBody.safeParse({ phone: "12345" }).success).toBe(false);
    expect(patientBody.safeParse({ phone: "9876543210", dob: "01-02-2000" }).success).toBe(false);
  });
  it("doctorBody", () => {
    expect(doctorBody.safeParse({ name: "Dr A", languages: ["en-IN", "kn-IN"] }).success).toBe(
      true,
    );
    expect(doctorBody.safeParse({ name: "Dr A", languages: ["fr-FR"] }).success).toBe(false);
  });
  it("workingHoursBody", () => {
    expect(
      workingHoursBody.safeParse({ hours: [{ weekday: 1, startTime: "09:00", endTime: "17:00" }] })
        .success,
    ).toBe(true);
    expect(
      workingHoursBody.safeParse({ hours: [{ weekday: 7, startTime: "09:00", endTime: "17:00" }] })
        .success,
    ).toBe(false);
    expect(
      workingHoursBody.safeParse({ hours: [{ weekday: 1, startTime: "9:00", endTime: "17:00" }] })
        .success,
    ).toBe(false);
  });
  it("serviceBody", () => {
    expect(serviceBody.safeParse({ name: "Scaling", durationMin: 30, priceInr: 0 }).success).toBe(
      true,
    );
    expect(serviceBody.safeParse({ name: "Scaling", durationMin: 0 }).success).toBe(false);
    expect(serviceBody.safeParse({ name: "Scaling", durationMin: 30, priceInr: -1 }).success).toBe(
      false,
    );
  });
  it("slotRulesBody", () => {
    expect(slotRulesBody.safeParse({ slotGrainMin: 15 }).success).toBe(true);
    expect(slotRulesBody.safeParse({ slotGrainMin: -5 }).success).toBe(false);
  });
  it("assistantProfileBody", () => {
    expect(
      assistantProfileBody.safeParse({ name: "Asha", faq: [{ q: "a", a: "b" }] }).success,
    ).toBe(true);
    expect(assistantProfileBody.safeParse({ faq: [{ q: "a" }] }).success).toBe(false);
  });
  it("appointmentBody and rescheduleBody", () => {
    const ok = {
      patientId: "p",
      doctorId: "d",
      serviceId: "s",
      date: "2026-10-05",
      startTime: "10:30",
    };
    expect(appointmentBody.safeParse(ok).success).toBe(true);
    expect(appointmentBody.safeParse({ ...ok, date: "5/10/2026" }).success).toBe(false);
    expect(rescheduleBody.safeParse({ date: "2026-10-05", startTime: "10:30" }).success).toBe(true);
    expect(rescheduleBody.safeParse({ date: "2026-10-05", startTime: "1030" }).success).toBe(false);
  });
});
