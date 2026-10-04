import { describe, expect, it, vi } from "vitest";
import {
  FetchError,
  JwksNotAvailableInCacheError,
  JwtExpiredError,
  JwtInvalidAudienceError,
  NonRetryableFetchError,
} from "aws-jwt-verify/error";
import { AuthUnavailableError, createCognitoVerifier, createDevVerifier } from "./verifier.js";

describe("createDevVerifier", () => {
  const v = createDevVerifier();
  it("accepts dev:<sub>:<email>", async () => {
    expect(await v.verify("dev:u1:a@b.co")).toEqual({ sub: "u1", email: "a@b.co", username: "u1" });
  });
  it.each(["", "dev:", "dev:u1", "dev:u1:nomail", "Bearer x", "dev:a:b@c:d", "xdev:u1:a@b.co"])(
    "rejects %j",
    async (t) => {
      await expect(v.verify(t)).rejects.toThrow();
    },
  );
});

describe("createCognitoVerifier", () => {
  it("returns sub/username/email and caches email per sub for 10 minutes", async () => {
    let t = 1_000;
    const jwtVerifier = { verify: vi.fn(async () => ({ sub: "s1", username: "alice" })) };
    const fetchEmail = vi.fn(async () => "alice@x.in");
    const v = createCognitoVerifier({
      userPoolId: "ap-south-1_abc",
      clientId: "c",
      jwtVerifier,
      fetchEmail,
      now: () => t,
    });
    expect(await v.verify("tok")).toEqual({ sub: "s1", email: "alice@x.in", username: "alice" });
    await v.verify("tok2");
    expect(fetchEmail).toHaveBeenCalledTimes(1);
    t += 10 * 60 * 1000 + 1;
    await v.verify("tok3");
    expect(fetchEmail).toHaveBeenCalledTimes(2);
  });
  it("propagates verification failures and does not fetch email", async () => {
    const fetchEmail = vi.fn();
    const v = createCognitoVerifier({
      userPoolId: "ap-south-1_abc",
      clientId: "c",
      jwtVerifier: { verify: async () => Promise.reject(new Error("bad jwt")) },
      fetchEmail,
    });
    await expect(v.verify("x")).rejects.toThrow("bad jwt");
    expect(fetchEmail).not.toHaveBeenCalled();
  });
  const clientWith = (attrs: { Name: string; Value: string }[]) => ({
    send: vi.fn(async () => ({ UserAttributes: attrs })),
  });
  const make = (client: ReturnType<typeof clientWith>) =>
    createCognitoVerifier({
      userPoolId: "ap-south-1_abc",
      clientId: "c",
      jwtVerifier: { verify: async () => ({ sub: "s1", username: "u" }) },
      client,
    });
  it("returns the email only when email_verified is exactly true", async () => {
    const ok = await make(
      clientWith([
        { Name: "email", Value: "a@x.in" },
        { Name: "email_verified", Value: "true" },
      ]),
    ).verify("t");
    expect(ok.email).toBe("a@x.in");
    for (const verified of ["false", "True", ""]) {
      const r = await make(
        clientWith([
          { Name: "email", Value: "a@x.in" },
          { Name: "email_verified", Value: verified },
        ]),
      ).verify("t");
      expect(r.email).toBeUndefined();
    }
    const missing = await make(clientWith([{ Name: "email", Value: "a@x.in" }])).verify("t");
    expect(missing.email).toBeUndefined();
  });
  it("maps transient GetUser failures to AuthUnavailableError, but rejections stay as-is", async () => {
    const mk = (err: Error) =>
      createCognitoVerifier({
        userPoolId: "ap-south-1_abc",
        clientId: "c",
        jwtVerifier: { verify: async () => ({ sub: "s1", username: "u" }) },
        fetchEmail: async () => Promise.reject(err),
      });
    await expect(mk(new Error("ECONNRESET")).verify("t")).rejects.toBeInstanceOf(
      AuthUnavailableError,
    );
    const na = Object.assign(new Error("nope"), { name: "NotAuthorizedException" });
    await expect(mk(na).verify("t")).rejects.not.toBeInstanceOf(AuthUnavailableError);
  });
  it("does not cache an unverified (undefined) email", async () => {
    const fetchEmail = vi.fn(async () => undefined);
    const v = createCognitoVerifier({
      userPoolId: "ap-south-1_abc",
      clientId: "c",
      jwtVerifier: { verify: async () => ({ sub: "s1", username: "u" }) },
      fetchEmail,
    });
    await v.verify("t");
    await v.verify("t");
    expect(fetchEmail).toHaveBeenCalledTimes(2);
  });
  describe("error classification", () => {
    const mk = (err: unknown, fetchEmail?: () => Promise<string | undefined>) =>
      createCognitoVerifier({
        userPoolId: "ap-south-1_abc",
        clientId: "c",
        jwtVerifier: { verify: async () => Promise.reject(err) },
        fetchEmail: fetchEmail ?? (async () => "a@x.in"),
      });
    it("keeps expired / wrong-audience tokens as plain rejections (401 upstream)", async () => {
      for (const err of [
        new JwtExpiredError("expired", 1, 2),
        new JwtInvalidAudienceError("aud", "x", "y"),
      ]) {
        const r = mk(err).verify("t");
        await expect(r).rejects.toBe(err);
        await expect(r).rejects.not.toBeInstanceOf(AuthUnavailableError);
      }
    });
    it("maps JWKS fetch/network failures to AuthUnavailableError (503 upstream)", async () => {
      const errs = [
        new FetchError("https://jwks", "ECONNRESET"),
        new NonRetryableFetchError("https://jwks", "Status code is 500"),
        new JwksNotAvailableInCacheError("not cached"),
        Object.assign(new Error("aborted"), { name: "AbortError" }),
        Object.assign(new Error("slow"), { name: "TimeoutError" }),
      ];
      for (const err of errs) {
        await expect(mk(err).verify("t")).rejects.toBeInstanceOf(AuthUnavailableError);
      }
    });
    it("passes Cognito UserNotFoundException through as a rejection (401 upstream)", async () => {
      const gone = Object.assign(new Error("gone"), { name: "UserNotFoundException" });
      const v = createCognitoVerifier({
        userPoolId: "ap-south-1_abc",
        clientId: "c",
        jwtVerifier: { verify: async () => ({ sub: "s1", username: "u" }) },
        fetchEmail: async () => Promise.reject(gone),
      });
      await expect(v.verify("t")).rejects.toBe(gone);
    });
  });
});
