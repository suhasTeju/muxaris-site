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
});
