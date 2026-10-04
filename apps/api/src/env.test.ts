import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

describe("loadEnv", () => {
  it("falls back to mock provider when the Sarvam key is absent", () => {
    const env = loadEnv({ API_PORT: "4000", DATABASE_URL: "postgres://x" });
    expect(env.provider).toBe("mock");
    expect(env.sarvamKey).toBeNull();
    expect(env.port).toBe(4000);
  });
  it("uses sarvam when the key is present", () => {
    expect(loadEnv({ SARVAM_TTS_API_KEY: "k", DATABASE_URL: "postgres://x" }).provider).toBe(
      "sarvam",
    );
  });
  it("throws a readable error without DATABASE_URL", () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });
});
