import { describe, expect, it } from "vitest";
import { resolveActiveClinic } from "./clinic";

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
