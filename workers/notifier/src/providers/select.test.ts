import { describe, expect, it } from "vitest";
import { loadEnv } from "../env.js";
import { buildProviders } from "./select.js";

const log = () => undefined;
describe("provider selection", () => {
  it("console mode: email via console, sms/whatsapp only when flagged", () => {
    const p = buildProviders(loadEnv({ DATABASE_URL: "x" }), log);
    expect(p.email?.channel).toBe("email");
    expect(p.sms).toBeNull();
    expect(p.whatsapp).toBeNull();
    const q = buildProviders(loadEnv({ DATABASE_URL: "x", SMS_ENABLED: "1" }), log);
    expect(q.sms?.channel).toBe("sms");
  });
  it("aws mode: SES email, SNS sms when flagged", () => {
    const p = buildProviders(
      loadEnv({ DATABASE_URL: "x", NOTIFY_FROM_EMAIL: "a@b.c", SMS_ENABLED: "true" }),
      log,
    );
    expect(p.email?.constructor.name).toBe("SesEmailProvider");
    expect(p.sms?.constructor.name).toBe("SnsSmsProvider");
    expect(p.whatsapp).toBeNull();
  });
});
