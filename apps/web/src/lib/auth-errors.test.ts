import { describe, expect, it } from "vitest";
import { authErrorMessage, safeNext } from "./auth-errors";

describe("authErrorMessage", () => {
  it("maps known Cognito errors", () => {
    const e = Object.assign(new Error("raw"), { name: "UsernameExistsException" });
    expect(authErrorMessage(e)).toMatch(/already exists/);
  });
  it("falls back to the raw message", () => {
    expect(authErrorMessage(new Error("weird"))).toBe("weird");
  });
});

describe("safeNext", () => {
  it("rejects open redirects", () => {
    expect(safeNext("//evil.com")).toBe("/app");
    expect(safeNext("https://evil.com")).toBe("/app");
    expect(safeNext("/app/calls")).toBe("/app/calls");
    expect(safeNext("/app/x?y=1")).toBe("/app/x?y=1");
    expect(safeNext("/\\evil.com")).toBe("/app");
    expect(safeNext("/app\nX")).toBe("/app");
    expect(safeNext("/..//evil.com")).toBe("/app");
    expect(safeNext("/%2F%2Fevil.com").startsWith("//")).toBe(false);
  });
});
