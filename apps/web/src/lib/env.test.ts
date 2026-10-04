import { describe, expect, it } from "vitest";
import { resolveUrls } from "./env";

describe("resolveUrls", () => {
  it("keeps localhost defaults outside production", () => {
    expect(
      resolveUrls({ nodeEnv: "development", apiUrl: undefined, voiceWsUrl: undefined }),
    ).toEqual({
      apiUrl: "http://localhost:4000",
      voiceWsUrl: "ws://localhost:4100",
    });
  });
  it("throws in production when a URL is missing or the WS url is not wss", () => {
    const ok = { nodeEnv: "production", apiUrl: "https://api.x", voiceWsUrl: "wss://v.x" };
    expect(resolveUrls(ok).voiceWsUrl).toBe("wss://v.x");
    expect(() => resolveUrls({ ...ok, apiUrl: undefined })).toThrow(/API_URL/);
    expect(() => resolveUrls({ ...ok, voiceWsUrl: undefined })).toThrow(/VOICE_WS_URL/);
    expect(() => resolveUrls({ ...ok, voiceWsUrl: "ws://v.x" })).toThrow(/wss/);
  });
});
