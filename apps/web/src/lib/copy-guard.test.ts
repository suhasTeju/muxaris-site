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
});
