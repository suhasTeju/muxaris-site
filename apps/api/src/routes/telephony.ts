import { createHmac, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { findClinicByPhoneNumber, signStreamToken } from "@muxaris/core";
import type { Db } from "@muxaris/db";
import type { TelephonyEnv } from "../env.js";

const STREAM_TOKEN_TTL_S = 5 * 60;
const PATH = "/webhooks/telephony/twilio";

const xmlEscape = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/** Twilio's algorithm: base64(HMAC-SHA1(authToken, url + sorted POST key+value pairs)). */
export function twilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url);
  return createHmac("sha1", authToken).update(data).digest("base64");
}

function signatureValid(
  authToken: string,
  url: string,
  params: Record<string, string>,
  header: string | undefined,
): boolean {
  if (!header) return false;
  const want = Buffer.from(twilioSignature(authToken, url, params));
  const got = Buffer.from(header);
  return got.length === want.length && timingSafeEqual(got, want);
}

const twiml = (body: string) =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });

/** Public inbound-call webhook. Disabled (404) unless TELEPHONY_PROVIDER=twilio. */
export function telephonyRoutes(db: Db, tel: TelephonyEnv | undefined, now = () => Date.now()) {
  const r = new Hono();
  r.post(PATH, async (c) => {
    if (!tel || tel.provider !== "twilio" || !tel.twilioAuthToken || !tel.streamSecret)
      return c.json({ error: { code: "not_found", message: "telephony is not enabled" } }, 404);
    const form = await c.req.parseBody();
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(form)) if (typeof v === "string") params[k] = v;
    if (
      !signatureValid(
        tel.twilioAuthToken,
        tel.publicApiUrl + PATH,
        params,
        c.req.header("X-Twilio-Signature"),
      )
    )
      return c.json({ error: { code: "forbidden", message: "bad signature" } }, 403);

    const { From, To, CallSid } = params;
    if (!To || !CallSid)
      return c.json({ error: { code: "validation", message: "missing To or CallSid" } }, 400);
    const hit = await findClinicByPhoneNumber(db, To);
    if (!hit) {
      console.log(
        JSON.stringify({ level: "info", msg: "telephony: unknown number", callSid: CallSid }),
      );
      return twiml("<Say>This number is not configured.</Say><Hangup/>");
    }
    const token = signStreamToken(tel.streamSecret, {
      callSid: CallSid,
      clinicId: hit.clinicId,
      from: From ?? "",
      exp: Math.floor(now() / 1000) + STREAM_TOKEN_TTL_S,
    });
    console.log(
      JSON.stringify({
        level: "info",
        msg: "telephony: inbound call",
        callSid: CallSid,
        clinicId: hit.clinicId,
      }),
    );
    const param = (n: string, v: string) => `<Parameter name="${n}" value="${xmlEscape(v)}"/>`;
    return twiml(
      `<Connect><Stream url="${xmlEscape(`${tel.voiceWssUrl}/v1/telephony/twilio`)}">` +
        param("token", token) +
        `</Stream></Connect>`,
    );
  });
  return r;
}
