import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

describe("notifier env", () => {
  const base = { DATABASE_URL: "postgres://x" };
  it("defaults to the console provider with no from-address", () => {
    const e = loadEnv(base);
    expect(e.providerMode).toBe("console");
    expect(e.channels).toEqual({ sms: false, whatsapp: false });
  });
  it("switches to aws when a from-address is set, and honours flags", () => {
    const e = loadEnv({ ...base, NOTIFY_FROM_EMAIL: "noreply@muxaris.com", SMS_ENABLED: "1" });
    expect(e.providerMode).toBe("aws");
    expect(e.fromEmail).toBe("noreply@muxaris.com");
    expect(e.channels.sms).toBe(true);
  });
  it("refuses aws mode without a from-address and whatsapp without credentials", () => {
    expect(() => loadEnv({ ...base, NOTIFY_PROVIDER: "aws" })).toThrow(/NOTIFY_FROM_EMAIL/);
    expect(() =>
      loadEnv({
        ...base,
        NOTIFY_PROVIDER: "aws",
        NOTIFY_FROM_EMAIL: "a@b.c",
        WHATSAPP_ENABLED: "1",
      }),
    ).toThrow(/WHATSAPP_TOKEN/);
  });
});
