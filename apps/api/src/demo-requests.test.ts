import { describe, expect, it, vi } from "vitest";
import { createDevVerifier } from "@muxaris/core";
import type { Db } from "@muxaris/db";
import { createApp } from "./app.js";

const valid = {
  name: "Dr Asha Rao",
  clinic: "Sunrise Dental Care",
  city: "Bengaluru",
  phone: "98765 43210",
  email: "asha@example.com",
  specialty: "dental",
  language: "kn-IN",
};

function setup() {
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
});
