import { createHmac, timingSafeEqual } from "node:crypto";

/** Short-lived token the API mints for a phone call and the gateway verifies before accepting it. */
export interface StreamTokenClaims {
  callSid: string;
  clinicId: string;
  /** Caller number from the signed webhook ("" when none); unverified caller ID. */
  from: string;
  exp: number;
}

const mac = (secret: string, payload: string) =>
  createHmac("sha256", secret).update(payload).digest();

/** `exp` is epoch seconds. Token = base64url(`callSid.clinicId.b64url(from).exp`) + "." + base64url(HMAC). */
export function signStreamToken(secret: string, input: StreamTokenClaims): string {
  const payload = `${input.callSid}.${input.clinicId}.${Buffer.from(input.from).toString("base64url")}.${input.exp}`;
  return `${Buffer.from(payload).toString("base64url")}.${mac(secret, payload).toString("base64url")}`;
}

/** `now` is epoch seconds. Returns null for any malformed, tampered or expired token. */
export function verifyStreamToken(
  secret: string,
  token: string,
  now: number,
): StreamTokenClaims | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [p, s] = parts as [string, string];
  const payload = Buffer.from(p, "base64url").toString();
  const given = Buffer.from(s, "base64url");
  const want = mac(secret, payload);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  const fields = payload.split(".");
  if (fields.length !== 4) return null;
  const [callSid, clinicId, fromRaw, expRaw] = fields as [string, string, string, string];
  const exp = Number(expRaw);
  if (!callSid || !clinicId || !Number.isInteger(exp) || exp <= now) return null;
  return { callSid, clinicId, from: Buffer.from(fromRaw, "base64url").toString(), exp };
}
