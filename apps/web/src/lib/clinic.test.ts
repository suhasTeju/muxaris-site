import { describe, expect, it } from "vitest";
import { clinicCookie, resolveActiveClinic } from "./clinic";

const ms = [{ clinicId: "a" }, { clinicId: "b" }];

describe("resolveActiveClinic", () => {
  it("honours a valid cookie", () => {
    expect(resolveActiveClinic(ms, "b")).toEqual({ clinicId: "b", cookieStale: false });
  });
  it("falls back to the first membership when the cookie is stale or missing", () => {
    expect(resolveActiveClinic(ms, "zzz")).toEqual({ clinicId: "a", cookieStale: true });
    expect(resolveActiveClinic(ms, undefined)).toEqual({ clinicId: "a", cookieStale: true });
  });
  it("returns null without memberships", () => {
    expect(resolveActiveClinic([], "a")).toBeNull();
  });
});

describe("clinicCookie", () => {
  it("is Secure on https only, always Lax and site-wide", () => {
    expect(clinicCookie("a b", true)).toBe(
      "muxaris_clinic=a%20b; Path=/; SameSite=Lax; max-age=31536000; Secure",
    );
    expect(clinicCookie("a", false)).not.toMatch(/Secure/);
  });
  it("clears with max-age=0", () => {
    expect(clinicCookie(null, false)).toBe("muxaris_clinic=; Path=/; SameSite=Lax; max-age=0");
  });
});
