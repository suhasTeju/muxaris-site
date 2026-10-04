import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FAQS, GREETINGS, PLANS, TRANSCRIPT, DEMO_STAGES } from "./content";

const publicDir = join(__dirname, "../../public");

describe("marketing content", () => {
  it("has 8 FAQs with non-empty answers", () => {
    expect(FAQS).toHaveLength(8);
    for (const f of FAQS) {
      expect(f.q.length).toBeGreaterThan(5);
      expect(f.a.length).toBeGreaterThan(20);
    }
  });

  it("has the Pilot and Standard plans with the agreed prices", () => {
    expect(PLANS.map((p) => p.id)).toEqual(["pilot", "standard"]);
    expect(PLANS[0]!.price).toBe("₹0");
    expect(PLANS[1]!.price).toBe("₹4,999");
  });

  it("has 5 languages whose greeting clips exist", () => {
    expect(GREETINGS.map((g) => g.label)).toEqual([
      "English",
      "Hindi",
      "Kannada",
      "Tamil",
      "Telugu",
    ]);
    for (const g of GREETINGS) expect(existsSync(join(publicDir, g.audio))).toBe(true);
    expect(existsSync(join(publicDir, "audio/sample-call.m4a"))).toBe(true);
  });

  it("orders the transcript and demo stages by time", () => {
    const ts = TRANSCRIPT.map((l) => l.at);
    expect(ts).toEqual([...ts].sort((a, b) => a - b));
    expect(DEMO_STAGES).toHaveLength(3);
  });
});
