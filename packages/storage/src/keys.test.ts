import { describe, expect, it } from "vitest";
import { callKeys } from "./keys.js";

describe("callKeys", () => {
  it("namespaces by clinic then call", () => {
    expect(callKeys.recording("cl_a", "call_1")).toBe("clinics/cl_a/calls/call_1/recording.wav");
    expect(callKeys.transcript("cl_a", "call_1")).toBe("clinics/cl_a/calls/call_1/transcript.json");
  });
  it("rejects ids with slashes or dots", () => {
    expect(() => callKeys.recording("cl_a/../x", "call_1")).toThrow(/invalid id/);
  });
});
