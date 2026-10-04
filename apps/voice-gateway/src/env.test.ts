import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

describe("voice-gateway loadEnv", () => {
  it("defaults DATABASE_URL, model and session cap outside production", () => {
    const env = loadEnv({});
    expect(env.databaseUrl).toBe("postgres://muxaris:muxaris@localhost:5433/muxaris");
    expect(env.bedrockModelId).toBe("global.amazon.nova-2-lite-v1:0");
    expect(env.maxSessions).toBe(15);
  });
  it("throws without DATABASE_URL in production", () => {
    expect(() => loadEnv({ NODE_ENV: "production" })).toThrow(/DATABASE_URL/);
  });
  it("honours BEDROCK_MODEL_ID and MAX_SESSIONS", () => {
    const env = loadEnv({ BEDROCK_MODEL_ID: "apac.amazon.nova-lite-v1:0", MAX_SESSIONS: "3" });
    expect(env.bedrockModelId).toBe("apac.amazon.nova-lite-v1:0");
    expect(env.maxSessions).toBe(3);
  });
});
