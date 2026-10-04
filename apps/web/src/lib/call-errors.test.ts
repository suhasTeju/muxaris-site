import { describe, expect, it } from "vitest";
import { classifyCallError } from "./call-errors";

describe("classifyCallError", () => {
  it.each([
    ["Permission denied", "mic"],
    ["invalid or expired token", "auth_failed"],
    ["start frame not received in time", "auth_failed"],
    ["authentication service unavailable", "provider"],
    ["Voice provider error", "provider"],
    ["too many concurrent calls", "busy"],
    ["monthly call minutes exhausted", "quota"],
    ["WebSocket error", "generic"],
    [null, "generic"],
  ] as const)("%s -> %s", (msg, kind) => {
    expect(classifyCallError(msg)).toBe(kind);
  });

  it.each([
    ["auth", "something unrelated", "auth_failed"],
    ["busy", "x", "busy"],
    ["quota", "x", "quota"],
    ["internal", "x", "provider"],
    ["network", "x", "generic"],
    ["unsupported", "x", "generic"],
    ["unsupported", "Permission denied", "mic"],
  ] as const)("errorCode %s beats wording (%s) -> %s", (code, msg, kind) => {
    // The wording below would classify as another kind; the code must win.
    expect(classifyCallError(code === "busy" ? "token expired" : msg, code)).toBe(kind);
  });

  it("falls back to wording for an unknown or missing code", () => {
    expect(classifyCallError("too many concurrent calls", undefined)).toBe("busy");
    expect(classifyCallError("too many concurrent calls", "weird")).toBe("busy");
  });
});
