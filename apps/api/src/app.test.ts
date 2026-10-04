import { describe, expect, it } from "vitest";
import { createDevVerifier } from "@muxaris/core";
import { createApp } from "./app.js";

describe("GET /healthz", () => {
  it("returns ok", async () => {
    const app = createApp({ version: "test", db: {} as never, verifier: createDevVerifier() });
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, service: "api", version: "test" });
  });
  it("allows no cross-origin callers by default", async () => {
    const app = createApp({ version: "test", db: {} as never, verifier: createDevVerifier() });
    const res = await app.request("/healthz", { headers: { Origin: "https://evil.example" } });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});
