import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const scriptsDir = resolve(import.meta.dirname, "../../scripts");

function shellFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sh"))
    .map((f) => join(dir, f));
}

const all = [...shellFiles(scriptsDir), ...shellFiles(join(scriptsDir, "lib"))];

describe("operational scripts", () => {
  it.each(all)("%s is valid bash", (file) => {
    const r = spawnSync("bash", ["-n", file], { encoding: "utf8" });
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
  });

  it.each(["push-images", "migrate", "request-cert", "bootstrap-aws"])(
    "%s.sh sources the AWS guard near the top",
    (name) => {
      const file = join(scriptsDir, `${name}.sh`);
      expect(existsSync(file)).toBe(true);
      const head = readFileSync(file, "utf8").split("\n").slice(0, 15).join("\n");
      expect(head).toContain("aws-guard.sh");
    },
  );

  it("smoke.sh never sends a bearer token over http", () => {
    const src = readFileSync(join(scriptsDir, "smoke.sh"), "utf8");
    expect(src).toContain("refusing to send a bearer token over http");
  });

  it("bootstrap --secrets merges into the existing secret and lists the telephony keys", () => {
    const src = readFileSync(join(scriptsDir, "bootstrap-aws.sh"), "utf8");
    expect(src).toContain("get-secret-value --secret-id muxaris/app");
    expect(src).toContain(".[0] + .[1]");
    expect(src).toContain("TWILIO_AUTH_TOKEN");
    expect(src).toContain("TELEPHONY_STREAM_SECRET");
    // values go through a file, not the command line
    expect(src).toContain('--secret-string "file://$TMP"');
  });

  it("push-images skips an existing tag instead of failing, and never retags", () => {
    const src = readFileSync(join(scriptsDir, "push-images.sh"), "utf8");
    expect(src).toContain("already in ECR");
    expect(src).toContain("continue");
    expect(src).not.toContain("ERROR: $repo:$TAG already exists");
    expect(src).not.toMatch(/--force|put-image/);
  });

  it("migrate.sh reads the MuxarisMigrate stack outputs", () => {
    const src = readFileSync(join(scriptsDir, "migrate.sh"), "utf8");
    expect(src).toContain('STACK="MuxarisMigrate"');
  });

  it("cdk.sh always rebuilds the packages", () => {
    const src = readFileSync(join(scriptsDir, "../infra/scripts/cdk.sh"), "utf8");
    expect(src).toContain("npm run build:packages");
    expect(src).not.toContain("packages/core/dist");
  });
});
