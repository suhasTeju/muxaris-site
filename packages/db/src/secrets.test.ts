import { describe, expect, it } from "vitest";
import { applySecretsToEnv, databaseUrlFromRdsSecret } from "./secrets.js";

const fake = (map: Record<string, string>) => ({
  get: async (arn: string): Promise<string | undefined> => map[arn],
});

describe("databaseUrlFromRdsSecret", () => {
  it("builds a URL and encodes the password", () => {
    const url = databaseUrlFromRdsSecret(
      JSON.stringify({
        username: "mux",
        password: "p@ss/w:rd",
        host: "db.internal",
        port: 5432,
        dbname: "muxaris",
      }),
    );
    expect(url).toBe("postgres://mux:p%40ss%2Fw%3Ard@db.internal:5432/muxaris");
  });
  it("rejects a secret missing a field", () => {
    expect(() => databaseUrlFromRdsSecret(JSON.stringify({ username: "a" }))).toThrow(/host/);
  });
});

describe("applySecretsToEnv", () => {
  it("does nothing without ARNs", async () => {
    const env: NodeJS.ProcessEnv = {};
    expect(await applySecretsToEnv(env, fake({}))).toEqual({ applied: [] });
    expect(env).toEqual({});
  });
  it("fills DATABASE_URL from DB_SECRET_ARN and app keys from APP_SECRET_ARN, never overriding set values", async () => {
    const env: NodeJS.ProcessEnv = {
      DB_SECRET_ARN: "arn:db",
      APP_SECRET_ARN: "arn:app",
      RAZORPAY_KEY_ID: "keep",
    };
    const r = await applySecretsToEnv(
      env,
      fake({
        "arn:db": JSON.stringify({
          username: "u",
          password: "p",
          host: "h",
          port: 5432,
          dbname: "d",
        }),
        "arn:app": JSON.stringify({
          SARVAM_TTS_API_KEY: "s",
          RAZORPAY_KEY_ID: "ignored",
          EMPTY: "",
        }),
      }),
    );
    expect(env.DATABASE_URL).toBe("postgres://u:p@h:5432/d");
    expect(env.SARVAM_TTS_API_KEY).toBe("s");
    expect(env.RAZORPAY_KEY_ID).toBe("keep");
    expect(env.EMPTY).toBeUndefined();
    expect(r.applied.sort()).toEqual(["DATABASE_URL", "SARVAM_TTS_API_KEY"]);
  });
  it("fails loudly when a named secret cannot be read", async () => {
    await expect(applySecretsToEnv({ DB_SECRET_ARN: "arn:missing" }, fake({}))).rejects.toThrow(
      /DB_SECRET_ARN/,
    );
  });
  it("never puts a value in the error message", async () => {
    await expect(
      applySecretsToEnv({ APP_SECRET_ARN: "arn:bad" }, fake({ "arn:bad": "{not json" })),
    ).rejects.toThrow(/APP_SECRET_ARN is not valid JSON$/);
  });
});
