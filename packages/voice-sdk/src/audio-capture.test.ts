import { afterEach, describe, expect, it, vi } from "vitest";
import { createMicCapture } from "./audio-capture.js";

afterEach(() => vi.unstubAllGlobals());

describe("createMicCapture", () => {
  it("releases a stream that resolves after stop()", async () => {
    const track = { stop: vi.fn() };
    let resolveGum!: (s: unknown) => void;
    const getUserMedia = vi.fn(() => new Promise((r) => (resolveGum = r)));
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia },
      configurable: true,
    });
    const ctxInstances: unknown[] = [];
    vi.stubGlobal(
      "AudioContext",
      class {
        constructor() {
          ctxInstances.push(this);
        }
      },
    );
    const cap = createMicCapture();
    const started = cap.start(() => undefined);
    cap.stop();
    resolveGum({ getTracks: () => [track] });
    await started;
    expect(track.stop).toHaveBeenCalled();
    expect(ctxInstances).toHaveLength(0);
  });
});
