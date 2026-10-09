import { describe, expect, it } from "vitest";
import { callErrorCopy, countdownText, orbLook, statusLabel } from "./call-visuals";

describe("call visuals", () => {
  it("labels each phase and voice state", () => {
    expect(statusLabel("idle", null, null)).toBe("Ready");
    expect(statusLabel("connecting", null, null)).toBe("Connecting…");
    expect(statusLabel("live", null, null)).toBe("Connected");
    expect(statusLabel("live", "thinking", null)).toBe("Thinking");
    expect(statusLabel("ended", null, null)).toBe("Call ended");
    expect(statusLabel("error", null, "Connection lost")).toBe("Connection lost");
    expect(statusLabel("error", null, "too many concurrent calls")).toBe("Ready");
  });

  it("shows one countdown line while live", () => {
    expect(countdownText("live", 1188, null)).toBe("19:48 left in this call");
    expect(countdownText("live", 300, 280)).toBe("Your plan has 4:40 of call time left this month");
    expect(countdownText("connecting", 300, null)).toBeNull();
    expect(countdownText("live", null, null)).toBeNull();
  });

  it("animates the bars while speaking and listening only", () => {
    const speaking = orbLook("live", "speaking", null);
    expect(speaking.bars.map((b) => b.height)).toEqual([14, 26, 38, 44, 36, 24, 16]);
    expect(speaking.bars[0]!.animation).toBe("mxBar 0.7s ease-in-out 0s infinite");
    expect(speaking.dot).toEqual({ color: "#16a34a", animation: "mxPulse 1.6s infinite" });
    const listening = orbLook("live", "listening", null);
    expect(listening.bars[3]!.height).toBeCloseTo(19.8);
    expect(listening.bars[0]!.height).toBe(8);
    expect(listening.bars[0]!.color).toBe("#aeb6c4");
    const thinking = orbLook("live", "thinking", null);
    expect(thinking.bars.every((b) => b.height === 10 && b.animation === "none")).toBe(true);
    expect(thinking.dot.color).toBe("#d98a14");
    const idle = orbLook("idle", null, null);
    expect(idle.bars.every((b) => b.height === 8 && b.color === "#3a4558")).toBe(true);
    expect(idle.dot.color).toBe("#c3ccd7");
    expect(orbLook("connecting", null, null).dot.color).toBe("#0e9a96");
    expect(orbLook("error", null, "Connection lost").dot.color).toBe("#e04870");
  });

  it("maps start problems and call failures to their copy", () => {
    const base = { configMessage: "", phase: "idle" as const, error: null, errorCode: null };
    expect(callErrorCopy({ ...base, startError: null })).toBeNull();
    expect(callErrorCopy({ ...base, startError: "network" })?.title).toBe(
      "Could not reach the sign-in service",
    );
    expect(callErrorCopy({ ...base, startError: "config", configMessage: "x" })).toEqual({
      title: "Calls are not available",
      body: "x",
      signIn: false,
    });
    expect(callErrorCopy({ ...base, startError: "auth" })).toMatchObject({
      title: "Your session expired",
      signIn: true,
    });
    expect(
      callErrorCopy({
        startError: null,
        configMessage: "",
        phase: "error",
        error: "Connection closed before ready (4029)",
        errorCode: "busy",
      })?.title,
    ).toBe("All call lines are busy");
  });
});
