import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

const dev = { AUTH_MODE: "dev" };

describe("voice-gateway loadEnv", () => {
  it("defaults DATABASE_URL, model and caps outside production", () => {
    const env = loadEnv(dev);
    expect(env.databaseUrl).toBe("postgres://muxaris:muxaris@localhost:5433/muxaris");
    expect(env.bedrockModelId).toBe("global.amazon.nova-2-lite-v1:0");
    expect(env.maxSessions).toBe(15);
    expect(env.maxCallSeconds).toBe(600);
  });
  it("throws without DATABASE_URL in production", () => {
    expect(() => loadEnv({ NODE_ENV: "production" })).toThrow(/DATABASE_URL/);
  });
  it("honours BEDROCK_MODEL_ID, MAX_SESSIONS and MAX_CALL_SECONDS", () => {
    const env = loadEnv({
      ...dev,
      BEDROCK_MODEL_ID: "apac.amazon.nova-lite-v1:0",
      MAX_SESSIONS: "3",
      MAX_CALL_SECONDS: "60",
    });
    expect(env.bedrockModelId).toBe("apac.amazon.nova-lite-v1:0");
    expect(env.maxSessions).toBe(3);
    expect(env.maxCallSeconds).toBe(60);
  });
  it("defaults to cognito auth and requires pool config", () => {
    expect(() => loadEnv({})).toThrow(/COGNITO_USER_POOL_ID/);
    const env = loadEnv({ COGNITO_USER_POOL_ID: "ap-south-1_x", COGNITO_CLIENT_ID: "c" });
    expect(env.authMode).toBe("cognito");
  });
  it("refuses dev auth in production and unknown modes", () => {
    expect(() => loadEnv({ NODE_ENV: "production", DATABASE_URL: "x", AUTH_MODE: "dev" })).toThrow(
      /not allowed in production/,
    );
    expect(() => loadEnv({ AUTH_MODE: "nope" })).toThrow(/AUTH_MODE/);
  });
  it.each(["abc", "", " ", "0", "-5", "1.5", "15x"])(
    "rejects MAX_SESSIONS / MAX_CALL_SECONDS / VOICE_PORT=%j at boot",
    (bad) => {
      expect(() => loadEnv({ ...dev, MAX_SESSIONS: bad })).toThrow(/MAX_SESSIONS/);
      expect(() => loadEnv({ ...dev, MAX_CALL_SECONDS: bad })).toThrow(/MAX_CALL_SECONDS/);
      expect(() => loadEnv({ ...dev, VOICE_PORT: bad })).toThrow(/VOICE_PORT/);
    },
  );
  describe("production providers", () => {
    const prod = {
      NODE_ENV: "production",
      DATABASE_URL: "x",
      COGNITO_USER_POOL_ID: "p",
      COGNITO_CLIENT_ID: "c",
    };
    it("throws at boot without a Sarvam key", () => {
      expect(() => loadEnv(prod)).toThrow(/SARVAM_TTS_API_KEY/);
      expect(() => loadEnv({ ...prod, SARVAM_TTS_API_KEY: "  " })).toThrow(/SARVAM_TTS_API_KEY/);
    });
    it("throws on provider=mock even with a key", () => {
      expect(() => loadEnv({ ...prod, SARVAM_TTS_API_KEY: "k", VOICE_PROVIDER: "mock" })).toThrow(
        /mock/,
      );
    });
    it("boots with a key, and allows mock outside production", () => {
      expect(loadEnv({ ...prod, SARVAM_TTS_API_KEY: "k" }).provider).toBe("sarvam");
      expect(loadEnv(dev).provider).toBe("mock");
      expect(loadEnv({ ...dev, SARVAM_TTS_API_KEY: "k", VOICE_PROVIDER: "mock" }).provider).toBe(
        "mock",
      );
    });
  });
});
