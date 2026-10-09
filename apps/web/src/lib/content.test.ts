import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEMO_LOOP_END,
  DEMO_STAGES,
  FAQS,
  GREETINGS,
  LEGAL_TOC,
  MARQUEE,
  PLANS,
  SAMPLE_CALL_DURATION,
  TRANSCRIPT,
} from "./content";

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

  it("keeps the sample call's transcript timings and loops after the call ends", () => {
    expect(TRANSCRIPT.map((l) => l.at)).toEqual([0, 4.3, 10.8, 13.6]);
    expect(DEMO_LOOP_END).toBeGreaterThan(SAMPLE_CALL_DURATION);
  });

  it("shows each greeting clip's length and scrolls one greeting per language", () => {
    expect(GREETINGS.map((g) => g.seconds)).toEqual([3.0, 3.7, 4.4, 4.0, 4.1]);
    expect(MARQUEE).toHaveLength(GREETINGS.length);
  });

  it("points every image at a file in public/", () => {
    const src = readFileSync(join(__dirname, "content.ts"), "utf8");
    const imgs = [...src.matchAll(/"(\/img\/[^"]+)"/g)].map((m) => m[1]!);
    expect(imgs.length).toBeGreaterThan(0);
    for (const img of imgs) expect(existsSync(join(publicDir, img))).toBe(true);
  });

  it.each(Object.keys(LEGAL_TOC) as (keyof typeof LEGAL_TOC)[])(
    "links every %s table-of-contents entry to a heading on that page",
    (page) => {
      const src = readFileSync(join(__dirname, `../app/${page}/page.tsx`), "utf8");
      const ids = [...src.matchAll(/<h2 id="([^"]+)"/g)].map((m) => m[1]);
      expect(ids).toEqual(LEGAL_TOC[page].map((e) => e.id));
    },
  );
});
