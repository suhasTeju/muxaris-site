// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVoicePreview, type VoicePreviewFetcher } from "./voice-preview";

const req = { clinicId: "cl_1", text: "Hello", language: "en-IN", speaker: "shubh" } as const;
const fetcher = vi.fn<VoicePreviewFetcher>(async () => new Blob(["x"], { type: "audio/wav" }));

let rejectPlay: (e: unknown) => void = () => {};
beforeEach(() => {
  window.HTMLMediaElement.prototype.play = vi.fn(
    () => new Promise<void>((_, reject) => (rejectPlay = reject)),
  );
  window.HTMLMediaElement.prototype.pause = vi.fn();
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => fetcher.mockClear());

describe("useVoicePreview", () => {
  it("Stop while play() is still pending shows no error", async () => {
    const { result } = renderHook(() => useVoicePreview(fetcher));
    let started!: Promise<void>;
    act(() => {
      started = result.current.toggle(req) as Promise<void>;
    });
    await vi.waitFor(() => expect(result.current.status).toBe("playing"));
    act(() => result.current.stop());
    await act(async () => {
      rejectPlay(new DOMException("The play() request was interrupted", "AbortError"));
      await started;
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBeNull();
  });

  it("a play() failure that is not a Stop still reports the error", async () => {
    const { result } = renderHook(() => useVoicePreview(fetcher));
    let started!: Promise<void>;
    act(() => {
      started = result.current.toggle(req) as Promise<void>;
    });
    await vi.waitFor(() => expect(result.current.status).toBe("playing"));
    await act(async () => {
      rejectPlay(new DOMException("blocked", "NotAllowedError"));
      await started;
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBe("Could not play the preview.");
  });
});
