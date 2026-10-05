import { describe, expect, it, vi } from "vitest";
import { createDevVerifier, verifyStreamToken } from "@muxaris/core";
import type { Db } from "@muxaris/db";
import { createApp } from "../app.js";
import type { TelephonyEnv } from "../env.js";
import { twilioSignature } from "./telephony.js";

const tel: TelephonyEnv = {
  provider: "twilio",
  twilioAuthToken: "authtok",
  streamSecret: "streamsecret",
  publicApiUrl: "https://api.example.test",
  voiceWssUrl: "wss://voice.example.test",
};
const URL_ = "https://api.example.test/webhooks/telephony/twilio";

function setup(
  rows: Array<{ clinicId: string; languages: string[] }>,
  t: TelephonyEnv | null = tel,
) {
  const where = vi.fn().mockResolvedValue(rows);
  const select = vi.fn(() => ({ from: () => ({ innerJoin: () => ({ where }) }) }));
  const db = { select } as unknown as Db;
  const app = createApp({
    version: "test",
    db,
    verifier: createDevVerifier(),
    ...(t ? { telephony: t } : {}),
  });
  const post = (params: Record<string, string>, sig?: string) =>
    app.request("/webhooks/telephony/twilio", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        ...(sig === undefined ? {} : { "X-Twilio-Signature": sig }),
      },
      body: new URLSearchParams(params).toString(),
    });
  return { select, post };
}
const params = { From: "+919876543210", To: "+15550001111", CallSid: "CA42" };
const sign = (p: Record<string, string>, token = "authtok") => twilioSignature(token, URL_, p);

describe("POST /webhooks/telephony/twilio", () => {
  it("matches Twilio's documented signature example", () => {
    // From Twilio's security docs (validating requests).
    const sig = twilioSignature("12345", "https://mycompany.com/myapp.php?foo=1&bar=2", {
      CallSid: "CA1234567890ABCDE",
      Caller: "+14158675310",
      Digits: "1234",
      From: "+14158675310",
      To: "+18005551212",
    });
    expect(sig).toBe("GvWf1cFY/Q7PnoempGyD5oXAezc=");
  });

  it("is 404 when the provider is not twilio", async () => {
    const { post, select } = setup([], { ...tel, provider: "none" });
    expect((await post(params, sign(params))).status).toBe(404);
    expect(select).not.toHaveBeenCalled();
    const off = setup([], null);
    expect((await off.post(params, sign(params))).status).toBe(404);
  });

  it("403s on a missing or wrong signature before touching the DB", async () => {
    const { post, select } = setup([{ clinicId: "cl_a", languages: ["en-IN"] }]);
    expect((await post(params)).status).toBe(403);
    expect((await post(params, sign(params, "wrong"))).status).toBe(403);
    expect((await post({ ...params, To: "+1999" }, sign(params))).status).toBe(403);
    expect((await post(params, "short")).status).toBe(403);
    expect(select).not.toHaveBeenCalled();
  });

  it("answers an unknown number with Say + Hangup", async () => {
    const { post } = setup([]);
    const res = await post(params, sign(params));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/xml");
    const body = await res.text();
    expect(body).toContain("This number is not configured.");
    expect(body).toContain("<Hangup/>");
  });

  it("mints a verifiable 5-minute stream token for a known number", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { post } = setup([{ clinicId: "cl_abc", languages: ["en-IN"] }]);
    const res = await post(params, sign(params));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/xml");
    const body = await res.text();
    expect(body).toContain('<Stream url="wss://voice.example.test/v1/telephony/twilio">');
    const token = /name="token" value="([^"]+)"/.exec(body)![1]!;
    const nowS = Math.floor(Date.now() / 1000);
    expect(verifyStreamToken("streamsecret", token, nowS)).toEqual({
      callSid: "CA42",
      clinicId: "cl_abc",
      from: "+919876543210",
      exp: expect.any(Number),
    });
    expect(verifyStreamToken("streamsecret", token, nowS + 301)).toBeNull();
    expect(body).not.toContain("9876543210");
    const logged = log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("CA42");
    expect(logged).not.toContain("9876543210");
    expect(logged).not.toContain("5550001111");
    log.mockRestore();
  });
});
