import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { requestLog } from "./request-log.js";

describe("requestLog", () => {
  it("logs method, pathname and status but never the query string", async () => {
    const lines: string[] = [];
    const app = new Hono();
    app.use(requestLog((line) => lines.push(line)));
    app.get("/v1/patients", (c) => c.json({ patients: [] }));
    const res = await app.request("/v1/patients?q=9876543210&limit=5");
    expect(res.status).toBe(200);
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    expect(line).toMatch(/^GET \/v1\/patients 200 \d+ms$/);
    expect(line).not.toContain("?");
    expect(line).not.toContain("q=");
    expect(line).not.toContain("9876543210");
  });

  it("records the status the handler chain produced", async () => {
    const lines: string[] = [];
    const app = new Hono();
    app.use(requestLog((line) => lines.push(line)));
    const res = await app.request("/v1/missing?email=a@b.test");
    expect(res.status).toBe(404);
    expect(lines[0]).toMatch(/^GET \/v1\/missing 404 \d+ms$/);
    expect(lines[0]).not.toContain("a@b.test");
  });
});
