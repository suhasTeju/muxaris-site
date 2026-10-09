import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { indianLandline } from "@muxaris/shared";
import {
  FIXTURE_EMAIL,
  FIXTURE_NOW,
  appointments,
  callTurns,
  callbacks,
  calls,
  doctors,
  notifications,
  openCallbacksCount,
  patientPhones,
  patients,
  services,
  usagePilot,
  usageStandard,
} from "./fixtures";

const ids = <T extends { id: string }>(xs: T[]) => new Set(xs.map((x) => x.id));

const SRC = fileURLToPath(new URL("../..", import.meta.url));

/** Every non-test source file under the dev-only folders (`app/dev`, `components/dev`). */
function devSources(): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const path = join(dir, e.name);
      if (e.isDirectory()) return walk(path);
      return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [path] : [];
    });
  return [join(SRC, "app/dev"), join(SRC, "components/dev")].flatMap(walk);
}

/**
 * Contacts written in a file that are not fictitious: emails outside example.com, and Indian
 * mobiles other than +91 900000 plus four digits. STD landlines (the clinic's prototype number) and
 * input placeholders (the design's copy) are allowed.
 */
function realLookingContacts(text: string): string[] {
  const code = text.replace(/placeholder="[^"]*"/g, "");
  const emails = [...code.matchAll(/[\w.%+-]+@([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi)]
    .filter((m) => m[1]!.toLowerCase() !== "example.com")
    .map((m) => m[0]);
  const phones = [...code.matchAll(/\+91[\s-]?\d[\d\s-]{8,12}\d/g)]
    .map((m) => m[0])
    .filter((m) => {
      const nsn = m.replace(/\D/g, "").slice(2);
      return nsn.length === 10 && !indianLandline(nsn) && !/^900000\d{4}$/.test(nsn);
    });
  return [...emails, ...phones];
}

describe("dev fixtures", () => {
  it("uses only fictitious people: example.com emails and +91 900000 mobiles", () => {
    const all = JSON.stringify({
      FIXTURE_EMAIL,
      patientPhones,
      patients,
      calls,
      callTurns,
      callbacks,
      notifications,
      appointments,
    });
    const domains = new Set([...all.matchAll(/@([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi)].map((m) => m[1]));
    expect([...domains]).toEqual(["example.com"]);
    const mobiles = [...all.matchAll(/\+91\s?[6-9]\d{4}\s?\d{5}/g)].map((m) => m[0]);
    expect(mobiles.length).toBeGreaterThanOrEqual(10);
    for (const m of mobiles) expect(m.replace(/\s/g, "")).toMatch(/^\+91900000\d{4}$/);
  });

  it("keeps every preview file to fictitious contacts", () => {
    const files = devSources();
    // The preview files that once held real-looking addresses must stay in the scan.
    for (const f of [
      "app/dev/auth/previews.tsx",
      "app/dev/ops/emails/page.tsx",
      "app/dev/core/_lib/fixture-api.ts",
      "components/dev/fixtures.ts",
      "components/dev/DevAppFrame.tsx",
    ])
      expect(files.map((p) => relative(SRC, p))).toContain(f);
    const found = files.flatMap((f) =>
      realLookingContacts(readFileSync(f, "utf8")).map((c) => `${relative(SRC, f)}: ${c}`),
    );
    expect(found).toEqual([]);
  });

  it("flags real-looking contacts and allows the fictitious forms", () => {
    expect(realLookingContacts('const EMAIL = "owner@clinic.in";')).toEqual(["owner@clinic.in"]);
    expect(realLookingContacts('phone: "+919876543210"')).toEqual(["+919876543210"]);
    expect(realLookingContacts("<span>+91 98765 43210</span>")).toEqual(["+91 98765 43210"]);
    expect(
      realLookingContacts(
        'owner@example.com "+919000003210" "+91 90000 03210" "+918041234567" "+91 80 4123 4567" ' +
          'placeholder="+91 98765 43210" import "@muxaris/shared"',
      ),
    ).toEqual([]);
  });

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
