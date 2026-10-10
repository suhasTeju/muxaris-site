import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("GET /healthz", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reports the web service as healthy and uncacheable", async () => {
    vi.stubEnv("GIT_SHA", "abc123");
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true, service: "web", sha: "abc123" });
  });

  it("falls back to dev when GIT_SHA is unset", async () => {
    vi.stubEnv("GIT_SHA", undefined);
    expect(await GET().json()).toMatchObject({ sha: "dev" });
  });
});
