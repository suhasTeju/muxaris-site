import { describe, expect, it } from "vitest";
import { signStreamToken, verifyStreamToken } from "./stream-token.js";

const secret = "s3cret";
const claims = { callSid: "CA123", clinicId: "cl_abc", from: "+15551230000", exp: 1000 };

describe("stream token", () => {
  it("round-trips before expiry", () => {
    const t = signStreamToken(secret, claims);
    expect(verifyStreamToken(secret, t, 999)).toEqual(claims);
  });
  it("round-trips an empty from and rejects a token signed for another from", () => {
    const t = signStreamToken(secret, { ...claims, from: "" });
    expect(verifyStreamToken(secret, t, 1)?.from).toBe("");
    const other = signStreamToken(secret, { ...claims, from: "+15559999999" });
    const forged = `${other.split(".")[0]}.${signStreamToken(secret, claims).split(".")[1]}`;
    expect(verifyStreamToken(secret, forged, 1)).toBeNull();
  });
  it("rejects expired tokens", () => {
    const t = signStreamToken(secret, claims);
    expect(verifyStreamToken(secret, t, 1000)).toBeNull();
    expect(verifyStreamToken(secret, t, 2000)).toBeNull();
  });
  it("rejects a wrong secret, tampered payload and garbage", () => {
    const t = signStreamToken(secret, claims);
    expect(verifyStreamToken("other", t, 1)).toBeNull();
    const [, sig] = t.split(".");
    const forged = `${Buffer.from("CA123.cl_other.KzE1NTUxMjMwMDAw.1000").toString("base64url")}.${sig}`;
    expect(verifyStreamToken(secret, forged, 1)).toBeNull();
    expect(verifyStreamToken(secret, "", 1)).toBeNull();
    expect(verifyStreamToken(secret, "a.b.c", 1)).toBeNull();
    expect(verifyStreamToken(secret, `${t}x`, 1)).toBeNull();
  });
});
