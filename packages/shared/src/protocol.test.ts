import { describe, it, expect } from "vitest";
import { clientEventSchema, gatewayEventSchema } from "./protocol.js";

describe("clientEventSchema", () => {
  it("parses valid events", () => {
    expect(
      clientEventSchema.parse({ type: "start", token: "t", clinicId: "c", language: "hi-IN" }).type,
    ).toBe("start");
    expect(clientEventSchema.parse({ type: "end" })).toEqual({ type: "end" });
    expect(clientEventSchema.parse({ type: "ping" })).toEqual({ type: "ping" });
  });
  it("rejects bad events", () => {
    expect(clientEventSchema.safeParse({ type: "start", clinicId: "c" }).success).toBe(false);
    expect(
      clientEventSchema.safeParse({ type: "start", token: "t", clinicId: "c", language: "xx" })
        .success,
    ).toBe(false);
    expect(clientEventSchema.safeParse({ type: "nope" }).success).toBe(false);
  });
});

describe("gatewayEventSchema", () => {
  it("parses valid events", () => {
    for (const e of [
      { type: "ready", callId: "1", assistantName: "A", greeting: "Hi", language: "en-IN" },
      { type: "state", state: "thinking" },
      { type: "transcript", role: "user", text: "hello", final: true },
      { type: "tool", name: "find_slots", status: "started", summary: "x" },
      {
        type: "booking",
        appointmentId: "a",
        doctorName: "d",
        serviceName: "s",
        startsAt: "2026-10-05T10:00:00Z",
      },
      { type: "flush_playback" },
      { type: "usage", secondsUsed: 1, secondsRemaining: 59 },
      { type: "ended", reason: "cap" },
      { type: "error", code: "not_implemented", message: "m" },
    ])
      expect(gatewayEventSchema.safeParse(e).success, JSON.stringify(e)).toBe(true);
  });
  it("rejects bad events", () => {
    expect(gatewayEventSchema.safeParse({ type: "state", state: "sleeping" }).success).toBe(false);
    expect(gatewayEventSchema.safeParse({ type: "ended", reason: "other" }).success).toBe(false);
    expect(
      gatewayEventSchema.safeParse({ type: "error", code: "teapot", message: "m" }).success,
    ).toBe(false);
    expect(
      gatewayEventSchema.safeParse({ type: "transcript", role: "user", text: "x", final: false })
        .success,
    ).toBe(false);
    expect(
      gatewayEventSchema.safeParse({ type: "tool", name: "nope", status: "done", summary: "" })
        .success,
    ).toBe(false);
  });
});
