import { describe, expect, it } from "vitest";
import { assertRuntimeEnv } from "./env";

const ok = { nodeEnv: "production", apiUrl: "https://api.x", voiceWsUrl: "wss://v.x" };
const unset = { nodeEnv: "production", apiUrl: undefined, voiceWsUrl: undefined };

describe("assertRuntimeEnv", () => {
  it("throws in production on a real host when a URL is unset or the WS url is not wss", () => {
    expect(() => assertRuntimeEnv(unset, "app.muxaris.com")).toThrow(/API_URL/);
    expect(() => assertRuntimeEnv({ ...ok, voiceWsUrl: undefined }, "app.muxaris.com")).toThrow(
      /VOICE_WS_URL/,
    );
    expect(() => assertRuntimeEnv({ ...ok, voiceWsUrl: "ws://v.x" }, "app.muxaris.com")).toThrow(
      /wss/,
    );
    expect(() => assertRuntimeEnv(ok, "app.muxaris.com")).not.toThrow();
  });
  it("is fine on localhost, in dev, and outside the browser", () => {
    expect(() => assertRuntimeEnv(unset, "localhost")).not.toThrow();
    expect(() => assertRuntimeEnv(unset, "127.0.0.1")).not.toThrow();
    expect(() => assertRuntimeEnv({ ...unset, nodeEnv: "development" }, "app.x")).not.toThrow();
    expect(() => assertRuntimeEnv(unset, undefined)).not.toThrow();
  });
});
