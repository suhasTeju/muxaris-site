import { describe, expect, it } from "vitest";
import { API_HOST, PUBLIC_API_URL, validateConfig } from "../lib/config.js";

const ok = {
  IMAGE_TAG: "abc1234",
  CERT_ARN: "arn:aws:acm:ap-south-1:005533348545:certificate/x",
  COGNITO_USER_POOL_ID: "ap-south-1_X",
  COGNITO_CLIENT_ID: "client",
};

describe("validateConfig", () => {
  it("accepts a complete config", () => {
    expect(validateConfig(ok)).toEqual({ services: [], migrate: [], cicd: [] });
  });

  it("derives the public API URL from API_HOST", () => {
    expect(PUBLIC_API_URL).toBe(`https://${API_HOST}`);
  });

  it("refuses Services and Migrate without IMAGE_TAG, naming the variable", () => {
    const p = validateConfig({ ...ok, IMAGE_TAG: "" });
    expect(p.services.join(" ")).toContain("IMAGE_TAG");
    expect(p.migrate.join(" ")).toContain("IMAGE_TAG");
    expect(p.cicd).toEqual([]);
  });

  it("refuses an empty CERT_ARN unless ALLOW_HTTP_ONLY=1", () => {
    const p = validateConfig({ ...ok, CERT_ARN: "" });
    expect(p.services.join(" ")).toMatch(/CERT_ARN.*removes the HTTPS listener/);
    expect(validateConfig({ ...ok, CERT_ARN: "", ALLOW_HTTP_ONLY: "1" }).services).toEqual([]);
    expect(validateConfig({ ...ok, CERT_ARN: "", ALLOW_HTTP_ONLY: "true" }).services).not.toEqual(
      [],
    );
  });

  it("requires Cognito ids only for Services and Cicd, so Auth deploys on an empty account", () => {
    const p = validateConfig({ IMAGE_TAG: "t", CERT_ARN: "c" });
    expect(p.services.join(" ")).toContain("COGNITO_USER_POOL_ID");
    expect(p.cicd.join(" ")).toContain("COGNITO_CLIENT_ID");
    expect(p.migrate).toEqual([]);
  });

  it("rejects an unknown TELEPHONY_PROVIDER", () => {
    expect(validateConfig({ ...ok, TELEPHONY_PROVIDER: "twilio" }).services).toEqual([]);
    expect(validateConfig({ ...ok, TELEPHONY_PROVIDER: "nope" }).services.join(" ")).toContain(
      "TELEPHONY_PROVIDER",
    );
  });
});
