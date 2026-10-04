import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const files = [
  "lib/content.ts",
  "app/page.tsx",
  "app/privacy/page.tsx",
  "app/terms/page.tsx",
  "app/pricing/page.tsx",
  "app/faq/page.tsx",
  ...readdirSync(join(root, "components/marketing"))
    .filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"))
    .map((f) => `components/marketing/${f}`),
];
const BANNED =
  /HIPAA|trusted by|first ring|within seconds|in pilot|Svara|Langfuse|before the patient hangs up|sent by email|email confirmations\b(?! \(coming soon\))|confirmation is sent|Confirmation sent|encrypted at rest|at rest|Every call on record|data kept in India/i;

describe("marketing copy guard", () => {
  it.each(files)("%s has no banned or overclaiming phrases", (f) => {
    expect(readFileSync(join(root, f), "utf8")).not.toMatch(BANNED);
  });

  it("privacy page and content state the shipped recording behaviour", () => {
    for (const f of ["lib/content.ts", "app/privacy/page.tsx"]) {
      const text = readFileSync(join(root, f), "utf8");
      expect(text).not.toMatch(/arrive with the call-centre release/);
      const flat = text.replace(/\s+/g, " ");
      expect(flat).toMatch(/recordings are stored encrypted in AWS Mumbai/i);
      expect(flat).toMatch(
        /recordings, transcripts and call summaries are deleted 90 days after the call/i,
      );
      expect(flat).toMatch(/turn recording off in Settings/i);
      expect(flat).toMatch(/transcribed but no audio is kept/i);
      // Only recordings are encrypted; never claim the transcripts are.
      expect(flat).not.toMatch(/transcripts[^.]{0,40}(stored )?encrypted/i);
    }
  });
});
