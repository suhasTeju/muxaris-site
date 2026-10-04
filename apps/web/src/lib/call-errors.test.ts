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
});
