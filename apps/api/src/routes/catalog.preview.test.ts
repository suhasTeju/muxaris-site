import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { Db } from "@muxaris/db";
import type { AppEnv } from "../deps.js";

vi.mock("@muxaris/core", async (orig) => ({
  ...(await orig<typeof import("@muxaris/core")>()),
  getMembership: vi.fn(async () => ({ role: "owner" })),
}));

import { catalogRoutes } from "./catalog.js";

const wav = Buffer.from("RIFFfakewav");

function setup(env: { provider: "sarvam" | "mock"; sarvamKey: string | null }) {
  const fetchMock = vi.fn(
    async (..._a: Parameters<typeof fetch>) =>
      new Response(JSON.stringify({ audios: [wav.toString("base64")] }), { status: 200 }),
  );
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "u1", email: "a@b.c", cognitoSub: "s" });
    await next();
  });
  app.route("/", catalogRoutes({} as Db, { env, fetch: fetchMock as unknown as typeof fetch }));
  const post = (body: unknown, clinic = "c1") =>
    app.request("/assistant/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Clinic-Id": clinic },
      body: JSON.stringify(body),
    });
  return { fetchMock, post };
}

const body = { text: "Hello there", language: "en-IN", speaker: "shubh" };

describe("POST /assistant/preview", () => {
  it("calls Sarvam with the key header and returns wav bytes", async () => {
    const { post, fetchMock } = setup({ provider: "sarvam", sarvamKey: "k-123" });
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/wav");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(wav);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.sarvam.ai/text-to-speech");
    expect((init!.headers as Record<string, string>)["api-subscription-key"]).toBe("k-123");
    expect(JSON.parse(init!.body as string)).toEqual({
      text: "Hello there",
      target_language_code: "en-IN",
      speaker: "shubh",
      model: "bulbul:v3",
      speech_sample_rate: 24000,
    });
  });

  it("returns 503 provider_unavailable in mock mode without calling out", async () => {
    const { post, fetchMock } = setup({ provider: "mock", sarvamKey: null });
    const res = await post(body);
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("provider_unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects invalid bodies", async () => {
    const { post } = setup({ provider: "sarvam", sarvamKey: "k" });
    expect((await post({ ...body, text: "" })).status).toBe(400);
    expect((await post({ ...body, speaker: "anushka" })).status).toBe(400);
    expect((await post({ ...body, text: "x".repeat(301) })).status).toBe(400);
  });

  it("maps upstream failures to 502 tts_failed", async () => {
    const { post, fetchMock } = setup({ provider: "sarvam", sarvamKey: "k" });
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 403 }));
    const r1 = await post(body);
    expect(r1.status).toBe(502);
    expect((await r1.json()).error.code).toBe("tts_failed");
    fetchMock.mockRejectedValueOnce(new Error("boom"));
    expect((await post(body)).status).toBe(502);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ audios: [] }), { status: 200 }));
    expect((await post(body)).status).toBe(502);
  });

  it("rate limits to 30 per hour per clinic", async () => {
    const { post } = setup({ provider: "sarvam", sarvamKey: "k" });
    for (let i = 0; i < 30; i++) expect((await post(body)).status).toBe(200);
    expect((await post(body)).status).toBe(429);
    expect((await post(body, "c2")).status).toBe(200);
  });
});
