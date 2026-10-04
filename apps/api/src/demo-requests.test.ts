import { afterEach, describe, expect, it, vi } from "vitest";
import { createDevVerifier } from "@muxaris/core";
import type { Db } from "@muxaris/db";
import { createApp } from "./app.js";
import { clientIp } from "./routes/demo-requests.js";

const valid = {
  name: "Dr Asha Rao",
  clinic: "Sunrise Dental Care",
  city: "Bengaluru",
  phone: "98765 43210",
  email: "asha@example.com",
  specialty: "dental",
  language: "kn-IN",
};

function setup(trustProxy = true) {
  vi.stubEnv("TRUST_PROXY", trustProxy ? "1" : "0");
  const values = vi.fn().mockResolvedValue(undefined);
  const db = { insert: vi.fn(() => ({ values })) } as unknown as Db;
  const app = createApp({ version: "test", db, verifier: createDevVerifier() });
  const post = (body: unknown, ip = "1.2.3.4") =>
    app.request("/v1/demo-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    });
  return { values, post };
}

afterEach(() => vi.unstubAllEnvs());

describe("POST /v1/demo-requests", () => {
  it("stores a valid request without auth and returns 201", async () => {
    const { post, values } = setup();
    const res = await post(valid);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ phone: "+919876543210", clinic: "Sunrise Dental Care" }),
    );
  });

  it("returns 400 on a bad phone number", async () => {
    const { post, values } = setup();
    const res = await post({ ...valid, phone: "12345" });
    expect(res.status).toBe(400);
    expect(values).not.toHaveBeenCalled();
  });

  it("rate limits to 5 per hour per IP", async () => {
    const { post } = setup();
    for (let i = 0; i < 5; i++) expect((await post(valid)).status).toBe(201);
    expect((await post(valid)).status).toBe(429);
    expect((await post(valid, "9.9.9.9")).status).toBe(201);
  });

  it("silently accepts honeypot hits without inserting", async () => {
    const { post, values } = setup();
    const res = await post({ ...valid, website: "http://spam.example" });
    expect(res.status).toBe(200);
    expect(values).not.toHaveBeenCalled();
  });

  it("ignores x-forwarded-for and skips limiting (with a warning) when proxy is not trusted", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { post, values } = setup(false);
    for (let i = 0; i < 7; i++) expect((await post(valid, `10.0.0.${i}`)).status).toBe(201);
    expect(values).toHaveBeenCalledTimes(7);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("uses the socket address when proxy is not trusted", () => {
    const c = {
      req: { header: () => "6.6.6.6" },
      env: { incoming: { socket: { remoteAddress: "1.1.1.1" } } },
    } as never;
    expect(clientIp(c, false)).toBe("1.1.1.1");
    expect(clientIp(c, true)).toBe("6.6.6.6");
  });
});
