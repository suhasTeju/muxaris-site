import { describe, expect, it } from "vitest";
import {
  FIXTURE_NOW,
  appointments,
  callTurns,
  callbacks,
  calls,
  doctors,
  notifications,
  openCallbacksCount,
  patients,
  services,
  usagePilot,
  usageStandard,
} from "./fixtures";

const ids = <T extends { id: string }>(xs: T[]) => new Set(xs.map((x) => x.id));

describe("dev fixtures", () => {
  it("transcribes the prototype's counts", () => {
    expect(
      [doctors, services, patients, appointments, calls, callbacks, notifications].map(
        (x) => x.length,
      ),
    ).toEqual([2, 6, 10, 19, 13, 5, 11]);
    expect(openCallbacksCount).toBe(3);
    expect(FIXTURE_NOW).toBe("2026-10-09T08:40:00.000Z");
  });

  it("keeps every reference resolvable", () => {
    const P = ids(patients);
    const D = ids(doctors);
    const S = ids(services);
    const C = ids(calls);
    const A = ids(appointments);
    for (const a of appointments) {
      expect(P.has(a.patientId) && D.has(a.doctorId) && S.has(a.serviceId)).toBe(true);
      if (a.createdByCallId) expect(C.has(a.createdByCallId)).toBe(true);
    }
    for (const c of calls) if (c.patientId) expect(P.has(c.patientId)).toBe(true);
    for (const cb of callbacks) expect(C.has(cb.callId!)).toBe(true);
    for (const n of notifications) {
      expect(P.has(n.patientId!)).toBe(true);
      expect(A.has(n.appointmentId!)).toBe(true);
    }
    for (const [callId, turns] of Object.entries(callTurns)) {
      expect(C.has(callId)).toBe(true);
      expect(turns.every((t) => t.callId === callId)).toBe(true);
    }
  });

  it("is API-shaped: masked phones, language codes, UTC instants", () => {
    const p1 = patients.find((p) => p.id === "p1")!;
    expect(p1.phoneMasked).toBe("+91 •••• ••3210");
    expect(p1.preferredLanguage).toBe("en-IN");
    const a7 = appointments.find((a) => a.id === "a7")!;
    expect(a7.startsAt).toBe("2026-10-09T11:00:00.000Z");
    expect(a7.createdByCallId).toBe("c1");
    expect(calls.find((c) => c.id === "c8")!.channel).toBe("browser");
    expect(
      callTurns["c5"]!.find((t) => t.role === "tool" && t.toolStatus === "error")?.toolName,
    ).toBe("transfer_to_staff");
    expect(notifications.find((n) => n.id === "n2")!.error).toBe("no_contact");
    expect(notifications.find((n) => n.id === "n3")!.payload.subject).toBe(
      "Reminder: appointment today at Sunrise Dental Care",
    );
  });

  it("carries the two plans' minutes", () => {
    expect(Math.ceil(usageStandard.callSeconds / 60)).toBe(1842);
    expect(usageStandard.includedCallMinutes).toBe(3000);
    expect(Math.ceil(usagePilot.callSeconds / 60)).toBe(462);
    expect(usagePilot.includedCallMinutes).toBe(500);
  });
});
