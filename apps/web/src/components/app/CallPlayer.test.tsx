// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Call } from "@muxaris/shared";
import { ApiError } from "@/lib/api";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ useApi: () => api }));

import { CallPlayer, waveBars } from "./CallPlayer";

beforeEach(() => {
  // jsdom has no media pipeline.
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  api.mockReset();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const props = (status: Call["recordingStatus"], extra: Record<string, unknown> = {}) => ({
  callId: "c1",
  recordingStatus: status,
  audioRef: { current: null },
  onTimeUpdate: vi.fn(),
  onCall: vi.fn(),
  ...extra,
});

describe("CallPlayer", () => {
  it("requests the recording URL once and renders a lazy audio element", async () => {
    api.mockResolvedValue({ url: "https://s3.example/rec.mp3?sig=1", expiresInS: 600 });
    const { container } = render(<CallPlayer {...props("ready")} />);
    await waitFor(() => expect(container.querySelector("audio")).not.toBeNull());
    const audio = container.querySelector("audio")!;
    expect(audio.getAttribute("src")).toBe("https://s3.example/rec.mp3?sig=1");
    expect(audio.getAttribute("preload")).toBe("none");
    // The design draws its own controls over a hidden element.
    expect(audio.hasAttribute("controls")).toBe(false);
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
    expect(screen.getByRole("slider", { name: "Seek" })).toBeTruthy();
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith("/v1/calls/c1/recording-url");
  });

  it("shows the call length on the clock before the audio loads", async () => {
    api.mockResolvedValue({ url: "https://s3.example/rec.mp3", expiresInS: 600 });
    render(<CallPlayer {...props("ready", { durationS: 78 })} />);
    expect(await screen.findByText("0:00 / 1:18")).toBeTruthy();
  });

  it("plays and pauses through the design's button", async () => {
    api.mockResolvedValue({ url: "https://s3.example/rec.mp3", expiresInS: 600 });
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const audioRef: { current: HTMLAudioElement | null } = { current: null };
    const { container } = render(<CallPlayer {...props("ready", { audioRef })} />);
    await waitFor(() => expect(container.querySelector("audio")).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(play).toHaveBeenCalledTimes(1);
    fireEvent.play(container.querySelector("audio")!);
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
  });

  it("offers Retry when the URL request fails", async () => {
    api
      .mockRejectedValueOnce(new ApiError(500, "internal", "boom"))
      .mockResolvedValueOnce({ url: "https://s3.example/rec.mp3", expiresInS: 600 });
    const { container } = render(<CallPlayer {...props("ready")} />);
    expect((await screen.findByRole("alert")).textContent).toContain("Recording unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(container.querySelector("audio")).not.toBeNull());
  });

  it("drops the failure when a Retry finds the recording still being saved", async () => {
    api
      .mockRejectedValueOnce(new ApiError(500, "internal", "boom"))
      .mockRejectedValueOnce(new ApiError(409, "recording_pending", "pending"));
    render(<CallPlayer {...props("ready")} />);
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Recording is being saved…")).toBeTruthy();
    expect(screen.queryByText("Recording unavailable")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("draws 48 bars, teal up to the playback position", () => {
    const bars = waveBars(0.5);
    expect(bars).toHaveLength(48);
    expect(bars.filter((b) => b.played)).toHaveLength(24);
    expect(bars[0]!.h).toBe(6);
    expect(Math.max(...bars.map((b) => b.h))).toBeLessThanOrEqual(34);
  });

  it("re-fetches the URL once when the element errors (expired link)", async () => {
    api
      .mockResolvedValueOnce({ url: "https://s3.example/old", expiresInS: 600 })
      .mockResolvedValueOnce({ url: "https://s3.example/new", expiresInS: 600 });
    const { container } = render(<CallPlayer {...props("ready")} />);
    await waitFor(() => expect(container.querySelector("audio")).not.toBeNull());
    fireEvent.error(container.querySelector("audio")!);
    await waitFor(() =>
      expect(container.querySelector("audio")!.getAttribute("src")).toBe("https://s3.example/new"),
    );
    fireEvent.error(container.querySelector("audio")!);
    await screen.findByText("Recording unavailable");
    expect(api).toHaveBeenCalledTimes(2);
  });

  it("reports playback position in milliseconds", async () => {
    api.mockResolvedValue({ url: "https://s3.example/rec.mp3", expiresInS: 600 });
    const p = props("ready");
    const { container } = render(<CallPlayer {...p} />);
    await waitFor(() => expect(container.querySelector("audio")).not.toBeNull());
    const audio = container.querySelector("audio")!;
    Object.defineProperty(audio, "currentTime", { value: 4.5, configurable: true });
    fireEvent.timeUpdate(audio);
    expect(p.onTimeUpdate).toHaveBeenCalledWith(4500);
  });

  it("shows an inline pending message on 409 recording_pending", async () => {
    api.mockRejectedValue(new ApiError(409, "recording_pending", "pending"));
    render(<CallPlayer {...props("ready")} />);
    const msg = await screen.findByText("Recording is being saved…");
    expect(msg.closest("[aria-live]")?.getAttribute("aria-live")).toBe("polite");
    expect(api).toHaveBeenCalledTimes(1);
  });

  it("says unavailable on 404 and on a failed recording, and renders nothing for none", async () => {
    api.mockRejectedValue(new ApiError(404, "not_found", "nope"));
    render(<CallPlayer {...props("ready")} />);
    await screen.findByText("Recording unavailable");
    cleanup();
    render(<CallPlayer {...props("failed")} />);
    expect(screen.getByText("Recording unavailable")).toBeTruthy();
    cleanup();
    const { container } = render(<CallPlayer {...props("none")} />);
    expect(container.textContent).toBe("");
  });

  it("polls the call every 5 s while pending, then fetches the URL once it is ready", async () => {
    vi.useFakeTimers();
    const onCall = vi.fn();
    api.mockImplementation(async (path: string) =>
      path.endsWith("/recording-url")
        ? { url: "https://s3.example/rec.mp3", expiresInS: 600 }
        : { call: { id: "c1", recordingStatus: "ready" } },
    );
    const { rerender } = render(<CallPlayer {...props("pending", { onCall })} />);
    expect(screen.getByText("Recording is being saved…")).toBeTruthy();
    expect(api).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(api).toHaveBeenCalledWith("/v1/calls/c1");
    expect(onCall).toHaveBeenCalledWith(expect.objectContaining({ recordingStatus: "ready" }));
    rerender(<CallPlayer {...props("ready", { onCall })} />);
    await act(async () => undefined);
    expect(api).toHaveBeenCalledWith("/v1/calls/c1/recording-url");
  });

  it("gives up after two minutes of pending", async () => {
    vi.useFakeTimers();
    api.mockResolvedValue({ call: { id: "c1", recordingStatus: "pending" } });
    render(<CallPlayer {...props("pending")} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(screen.getByText("Recording unavailable")).toBeTruthy();
    expect(screen.queryByText("Recording is being saved…")).toBeNull();
  });
});
