import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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
  it("forces the secondary profile unless CI credentials exist, ignoring an ambient profile", () => {
    const src = readFileSync(guard, "utf8");
    expect(src).toContain("AWS_WEB_IDENTITY_TOKEN_FILE");
    expect(src).toContain("AWS_ACCESS_KEY_ID");
    // the condition no longer defers to an existing AWS_PROFILE
    expect(src).not.toMatch(/-z "\$\{AWS_PROFILE:-\}"/);
  });

  // Stub aws on PATH so nothing real is called; it prints the account and the profile it saw.
  const run = (env: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), "guard-"));
    writeFileSync(
      join(dir, "aws"),
      '#!/usr/bin/env bash\necho "profile=${AWS_PROFILE:-none}" >&2\necho 005533348545\n',
      { mode: 0o755 },
    );
    const r = spawnSync("bash", ["-c", `source ${guard}; echo "PROFILE=$AWS_PROFILE"`], {
      encoding: "utf8",
      env: { PATH: `${dir}:/usr/bin:/bin`, ...env },
    });
    rmSync(dir, { recursive: true });
    return r;
  };
  it("overrides an ambient AWS_PROFILE with aws-secondary-account", () => {
    const r = run({ AWS_PROFILE: "primary-profile" });
    expect(r.stdout).toContain("PROFILE=aws-secondary-account");
    expect(r.stderr).not.toContain("profile=primary-profile");
  });
  it("leaves the profile alone under web identity (CI)", () => {
    const r = run({ AWS_WEB_IDENTITY_TOKEN_FILE: "/tmp/token" });
    expect(r.stdout).toContain("PROFILE=\n");
  });
});
