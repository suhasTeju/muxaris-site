import { describe, expect, it } from "vitest";
import { BULBUL_V3_SPEAKERS, LANGUAGES, LANGUAGE_CODES } from "./languages.js";

describe("languages", () => {
  it("uses only verified bulbul:v3 speakers", () => {
    for (const l of LANGUAGES) expect(BULBUL_V3_SPEAKERS).toContain(l.sarvamSpeaker);
  });
  it("covers every language code once", () => {
    expect(LANGUAGES.map((l) => l.code)).toEqual([...LANGUAGE_CODES]);
  });
});
