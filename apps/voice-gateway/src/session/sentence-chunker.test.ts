import { describe, expect, it } from "vitest";
import { chunkSentences } from "./sentence-chunker.js";

async function* from(parts: string[]) {
  for (const p of parts) yield p;
}
async function collect(parts: string[]) {
  const out: string[] = [];
  for await (const s of chunkSentences(from(parts))) out.push(s);
  return out;
}

describe("chunkSentences", () => {
  it("splits at . ? !", async () => {
    expect(await collect(["Hello there. How are", " you? Fine! ok"])).toEqual([
      "Hello there.",
      "How are you?",
      "Fine!",
      "ok",
    ]);
  });
  it("splits at the Devanagari danda, even without a following space", async () => {
    expect(await collect(["नमस्ते।आप कैसे हैं।", " ठीक"])).toEqual([
      "नमस्ते।",
      "आप कैसे हैं।",
      "ठीक",
    ]);
  });
  it("does not split inside decimals or abbreviations followed by non-space", async () => {
    expect(await collect(["Rs.500 at 2.30 pm today."])).toEqual(["Rs.500 at 2.30 pm today."]);
  });
  it("caps chunks at 120 characters, preferring a word boundary", async () => {
    const long = Array.from({ length: 40 }, () => "word").join(" "); // 199 chars, no terminator
    const out = await collect([long]);
    expect(out.length).toBeGreaterThan(1);
    for (const c of out) expect(c.length).toBeLessThanOrEqual(120);
    expect(out.join(" ")).toBe(long);
  });
  it("hard-cuts a 130-char token run at 120", async () => {
    const out = await collect(["x".repeat(130)]);
    expect(out.map((c) => c.length)).toEqual([120, 10]);
  });
  it("drops whitespace-only pieces and flushes the tail", async () => {
    expect(await collect(["  ", "\n", "Done"])).toEqual(["Done"]);
    expect(await collect([])).toEqual([]);
  });
});
