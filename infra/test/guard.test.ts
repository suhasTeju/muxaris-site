import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const guard = resolve(import.meta.dirname, "../../scripts/lib/aws-guard.sh");

describe("aws-guard.sh", () => {
  it("is valid bash", () => {
    expect(() => execFileSync("bash", ["-n", guard])).not.toThrow();
  });
  it("always checks the account", () => {
    const src = readFileSync(guard, "utf8");
    expect(src).toContain("005533348545");
    expect(src).toContain("sts get-caller-identity");
  });
  it("only forces the profile when no ambient credentials exist", () => {
    const src = readFileSync(guard, "utf8");
    expect(src).toContain("AWS_WEB_IDENTITY_TOKEN_FILE");
    expect(src).toContain("AWS_ACCESS_KEY_ID");
    expect(src).toMatch(/AWS_PROFILE:-/);
  });
});
