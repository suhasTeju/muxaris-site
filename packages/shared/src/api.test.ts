import { describe, it, expect } from "vitest";
import {
  appointmentBody,
  assistantProfileBody,
  createClinicBody,
  demoRequestBody,
  doctorBody,
  indianPhone,
  memberRoleBody,
  patientBody,
  rescheduleBody,
  serviceBody,
  slotRulesBody,
  workingHoursBody,
} from "./api.js";

describe("indianPhone", () => {
  it.each([
    "+919876543210",
    "919876543210",
    "09876543210",
    "9876543210",
    "+91 98765-43210",
    "(0) 98765 43210",
  ])("accepts and normalises %s", (v) => {
    expect(indianPhone.parse(v)).toBe("+919876543210");
  });
  it.each(["02212345678", "+912212345678", "2212345678", "98765", "+449876543210", "abc", ""])(
    "rejects %s",
    (v) => {
      expect(indianPhone.safeParse(v).success).toBe(false);
    },
  );
});

describe("api bodies", () => {
  it("createClinicBody", () => {
    expect(
      createClinicBody.parse({ name: "Smile", city: "Mysuru", phone: "9876543210" }).phone,
    ).toBe("+919876543210");
    expect(
      createClinicBody.safeParse({ name: "Smile", city: "Mysuru", phone: "1234567890" }).success,
    ).toBe(false);
  });
  it("patientBody", () => {
    expect(patientBody.parse({ phone: "6000000000" }).phone).toBe("+916000000000");
    expect(patientBody.safeParse({ phone: "12345" }).success).toBe(false);
    expect(patientBody.safeParse({ phone: "9876543210", dob: "01-02-2000" }).success).toBe(false);
  });
  it("strips unknown keys", () => {
    const out = patientBody.parse({ phone: "9876543210", clinicId: "evil", id: "x" });
    expect(out).not.toHaveProperty("clinicId");
    expect(out).not.toHaveProperty("id");
  });
  it("doctorBody", () => {
    expect(doctorBody.safeParse({ name: "Dr A", languages: ["en-IN", "kn-IN"] }).success).toBe(
      true,
    );
    expect(doctorBody.safeParse({ name: "Dr A", languages: ["fr-FR"] }).success).toBe(false);
  });
  it("workingHoursBody", () => {
    const h = (weekday: number, startTime: string, endTime: string) => ({
      hours: [{ weekday, startTime, endTime }],
    });
    expect(workingHoursBody.safeParse(h(1, "09:00", "17:00")).success).toBe(true);
    expect(workingHoursBody.safeParse(h(1, "18:00", "24:00")).success).toBe(true);
    expect(workingHoursBody.safeParse(h(1, "18:00", "00:00")).success).toBe(true);
    expect(workingHoursBody.safeParse(h(1, "00:00", "00:00")).success).toBe(false);
    expect(workingHoursBody.safeParse(h(7, "09:00", "17:00")).success).toBe(false);
    expect(workingHoursBody.safeParse(h(1, "9:00", "17:00")).success).toBe(false);
    expect(workingHoursBody.safeParse(h(1, "99:99", "17:00")).success).toBe(false);
    expect(workingHoursBody.safeParse(h(1, "24:00", "24:00")).success).toBe(false);
    expect(workingHoursBody.safeParse(h(1, "17:00", "09:00")).success).toBe(false);
    expect(workingHoursBody.safeParse(h(1, "09:00", "09:00")).success).toBe(false);
    const many = Array.from({ length: 22 }, () => ({
      weekday: 1,
      startTime: "09:00",
      endTime: "10:00",
    }));
    expect(workingHoursBody.safeParse({ hours: many }).success).toBe(false);
    expect(workingHoursBody.safeParse({ hours: many.slice(0, 21) }).success).toBe(true);
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
  it("slotRulesBody bounds", () => {
    expect(slotRulesBody.safeParse({}).success).toBe(true);
    expect(
      slotRulesBody.safeParse({
        slotGrainMin: 5,
        leadTimeMin: 1440,
        maxDaysAhead: 365,
        maxPerSlot: 10,
        allowSameDay: false,
      }).success,
    ).toBe(true);
    for (const bad of [
      { slotGrainMin: 4 },
      { slotGrainMin: 61 },
      { leadTimeMin: -1 },
      { leadTimeMin: 1441 },
      { maxDaysAhead: 0 },
      { maxDaysAhead: 366 },
      { maxPerSlot: 0 },
      { maxPerSlot: 11 },
      { allowSameDay: "yes" },
    ])
      expect(slotRulesBody.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
  });
  it("assistantProfileBody", () => {
    expect(
      assistantProfileBody.safeParse({
        name: "Asha",
        greeting: { "en-IN": "Hello" },
        voices: { "hi-IN": "priya" },
        handoffNumber: "98765 43210",
        faq: [{ q: "a", a: "b" }],
      }).success,
    ).toBe(true);
    expect(assistantProfileBody.parse({ handoffNumber: "9876543210" }).handoffNumber).toBe(
      "+919876543210",
    );
    for (const bad of [
      { name: "x".repeat(61) },
      { voices: { "hi-IN": "anushka" } },
      { voices: { "xx-XX": "priya" } },
      { greeting: { "fr-FR": "Salut" } },
      { greeting: { "en-IN": "x".repeat(301) } },
      { tone: "x".repeat(201) },
      { faq: [{ q: "a" }] },
      { faq: Array.from({ length: 31 }, () => ({ q: "a", a: "b" })) },
      { faq: [{ q: "q".repeat(201), a: "b" }] },
      { knowledge: "k".repeat(8001) },
    ])
      expect(assistantProfileBody.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
  });
  it("appointmentBody and rescheduleBody", () => {
    const ok = {
      patient: { phone: "9876543210", name: "Ravi", preferredLanguage: "kn-IN" },
      doctorId: "d",
      serviceId: "s",
      startsAt: "2026-10-05T10:30:00+05:30",
    };
    expect(appointmentBody.parse(ok).patient.phone).toBe("+919876543210");
    expect(appointmentBody.safeParse({ ...ok, startsAt: "2026-10-05T10:30:00" }).success).toBe(
      false,
    );
    expect(appointmentBody.safeParse({ ...ok, startsAt: "2026-10-05" }).success).toBe(false);
    expect(appointmentBody.safeParse({ ...ok, patient: { phone: "123" } }).success).toBe(false);
    expect(rescheduleBody.safeParse({ startsAt: "2026-10-05T05:00:00Z" }).success).toBe(true);
    expect(rescheduleBody.safeParse({ startsAt: "10:30" }).success).toBe(false);
  });
  it("memberRoleBody", () => {
    expect(memberRoleBody.safeParse({ role: "owner" }).success).toBe(true);
    expect(memberRoleBody.safeParse({ role: "front_desk" }).success).toBe(true);
    expect(memberRoleBody.safeParse({ role: "admin" }).success).toBe(false);
  });
});

describe("demoRequestBody", () => {
  const ok = {
    name: "Dr Asha",
    clinic: "Sunrise Dental",
    city: "Bengaluru",
    phone: "98765 43210",
    email: "asha@example.com",
    specialty: "dental",
    language: "kn-IN",
  };
  it("accepts a valid request and normalises the phone", async () => {
    expect(demoRequestBody.parse(ok).phone).toBe("+919876543210");
  });
  it("rejects bad phone, email and city", async () => {
    expect(demoRequestBody.safeParse({ ...ok, phone: "12345" }).success).toBe(false);
    expect(demoRequestBody.safeParse({ ...ok, email: "nope" }).success).toBe(false);
    expect(demoRequestBody.safeParse({ ...ok, city: "Paris" }).success).toBe(false);
  });
});
