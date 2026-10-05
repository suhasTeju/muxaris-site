import { describe, expect, it } from "vitest";
import { sslFromEnv } from "./ssl.js";

describe("sslFromEnv", () => {
  it("is undefined when DATABASE_SSL is unset or empty", () => {
    expect(sslFromEnv({})).toBeUndefined();
    expect(sslFromEnv({ DATABASE_SSL: "" })).toBeUndefined();
  });
  it("verify uses the embedded RDS global bundle by default", () => {
    const r = sslFromEnv({ DATABASE_SSL: "verify" }) as { rejectUnauthorized: boolean; ca: string };
    expect(r.rejectUnauthorized).toBe(true);
    expect(r.ca.split("-----BEGIN CERTIFICATE-----").length).toBeGreaterThan(100);
  });
  it("verify reads DATABASE_SSL_CA when given", () => {
    const r = sslFromEnv({ DATABASE_SSL: "verify", DATABASE_SSL_CA: "/dev/null" });
    expect(r).toEqual({ rejectUnauthorized: true, ca: "" });
  });
  it("no-verify is accepted for debugging only and encrypts without verifying the chain", () => {
    expect(sslFromEnv({ DATABASE_SSL: "no-verify" })).toEqual({ rejectUnauthorized: false });
  });
  it("rejects unknown modes", () => {
    expect(() => sslFromEnv({ DATABASE_SSL: "yes" })).toThrow(/DATABASE_SSL/);
  });
});
