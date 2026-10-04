import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { createServer } from "./server.js";

let server: ReturnType<typeof createServer>;
let port = 0;
beforeAll(async () => {
  server = createServer({ version: "test" });
  await new Promise<void>((r) => server.listen(0, r));
  port = (server.address() as { port: number }).port;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("voice-gateway", () => {
  it("serves /healthz", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(await res.json()).toEqual({ ok: true, service: "voice-gateway", version: "test" });
  });
  it("accepts a ws upgrade on /v1/session and replies not_implemented", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/v1/session`);
    const msg = await new Promise<string>((r) => ws.once("message", (d) => r(d.toString())));
    expect(JSON.parse(msg)).toMatchObject({ type: "error", code: "not_implemented" });
  });
});
