import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

describe("loadEnv", () => {
  it("falls back to mock provider when the Sarvam key is absent", () => {
    const env = loadEnv({ API_PORT: "4000", DATABASE_URL: "postgres://x", AUTH_MODE: "dev" });
    expect(env.provider).toBe("mock");
    expect(env.sarvamKey).toBeNull();
    expect(env.port).toBe(4000);
  });
  it("uses sarvam when the key is present", () => {
    expect(
      loadEnv({ SARVAM_TTS_API_KEY: "k", DATABASE_URL: "postgres://x", AUTH_MODE: "dev" }).provider,
    ).toBe("sarvam");
  });
  it("defaults DATABASE_URL to the local dev database outside production", () => {
    expect(loadEnv({ AUTH_MODE: "dev" }).databaseUrl).toBe(
      "postgres://muxaris:muxaris@localhost:5433/muxaris",
    );
  });
  it("throws a readable error without DATABASE_URL in production", () => {
    expect(() => loadEnv({ NODE_ENV: "production", AUTH_MODE: "dev" })).toThrow(/DATABASE_URL/);
  });
  it("defaults AUTH_MODE to cognito and requires pool config", () => {
    expect(() => loadEnv({})).toThrow(/COGNITO/);
    const e = loadEnv({ COGNITO_USER_POOL_ID: "p", COGNITO_CLIENT_ID: "c" });
    expect(e.authMode).toBe("cognito");
  });
  it("allows AUTH_MODE=dev only outside production", () => {
    expect(loadEnv({ AUTH_MODE: "dev" }).authMode).toBe("dev");
    expect(() =>
      loadEnv({ AUTH_MODE: "dev", NODE_ENV: "production", DATABASE_URL: "postgres://x" }),
    ).toThrow(/production/);
    expect(() => loadEnv({ AUTH_MODE: "nope" })).toThrow(/AUTH_MODE/);
  });
});

describe("telephony env", () => {
  const base = { DATABASE_URL: "postgres://x", AUTH_MODE: "dev" } as NodeJS.ProcessEnv;
  it("defaults to none with local URLs", () => {
    const t = loadEnv(base).telephony;
    expect(t).toMatchObject({
      provider: "none",
      publicApiUrl: "http://localhost:4000",
      voiceWssUrl: "ws://localhost:4100",
    });
  });
  it("requires the auth token and stream secret for twilio", () => {
    expect(() => loadEnv({ ...base, TELEPHONY_PROVIDER: "twilio" })).toThrow(/TWILIO_AUTH_TOKEN/);
    expect(
      loadEnv({
        ...base,
        TELEPHONY_PROVIDER: "twilio",
        TWILIO_AUTH_TOKEN: "a",
        TELEPHONY_STREAM_SECRET: "b",
      }).telephony.provider,
    ).toBe("twilio");
    expect(() => loadEnv({ ...base, TELEPHONY_PROVIDER: "nope" })).toThrow();
  });
});
