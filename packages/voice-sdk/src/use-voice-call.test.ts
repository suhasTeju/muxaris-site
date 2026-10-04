import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { parseGatewayEvent } from "./client.js";
import { FakeSocket, readyEvent } from "./test-helpers.js";
import { useVoiceCall } from "./use-voice-call.js";

function setup() {
  const sock = new FakeSocket();
  const mic = { start: vi.fn(async () => undefined), stop: vi.fn() };
  const player = { enqueue: vi.fn(), flush: vi.fn(), close: vi.fn() };
  const hook = renderHook(() =>
    useVoiceCall({
      url: "ws://x/v1/session",
      token: "tok",
      clinicId: "c1",
      language: "en-IN",
      wsFactory: () => sock,
      mediaFactory: () => mic,
      playerFactory: () => player,
    }),
  );
  return { sock, mic, player, hook };
}
const ready = readyEvent;

describe("parseGatewayEvent", () => {
  it("accepts valid and ignores invalid", () => {
    expect(parseGatewayEvent('{"type":"flush_playback"}')).toEqual({ type: "flush_playback" });
    expect(parseGatewayEvent('{"type":"nope"}')).toBeNull();
    expect(parseGatewayEvent("not json")).toBeNull();
  });
});

describe("useVoiceCall", () => {
  it("runs a scripted call", async () => {
    const { sock, mic, player, hook } = setup();
    expect(hook.result.current.phase).toBe("idle");
    let p!: Promise<void>;
    act(() => {
      p = hook.result.current.start();
    });
    expect(hook.result.current.phase).toBe("connecting");
    act(() => sock.open());
    expect(JSON.parse(sock.sent[0] as string)).toEqual({
      type: "start",
      token: "tok",
      clinicId: "c1",
      language: "en-IN",
    });
    await act(async () => {
      sock.emit(ready);
      await p;
    });
    expect(hook.result.current.phase).toBe("live");
    expect(mic.start).toHaveBeenCalled();

    act(() => {
      sock.emit({ type: "state", state: "speaking" });
      sock.emit({ type: "transcript", role: "assistant", text: "Hello", final: true });
      sock.emit({ type: "tool", name: "find_slots", status: "started", summary: "a" });
      sock.emit({ type: "tool", name: "find_slots", status: "done", summary: "b" });
      sock.emit({ type: "usage", secondsUsed: 5, secondsRemaining: 55 });
      sock.emit({ type: "flush_playback" });
      sock.onmessage?.({ data: new ArrayBuffer(4) });
    });
    const r = hook.result.current;
    expect(r.state).toBe("speaking");
    expect(r.lines).toEqual([{ role: "assistant", text: "Hello" }]);
    expect(r.tools).toEqual([{ name: "find_slots", status: "done", summary: "b" }]);
    expect(r.secondsRemaining).toBe(55);
    expect(player.flush).toHaveBeenCalled();
    expect(player.enqueue).toHaveBeenCalled();

    act(() => hook.result.current.stop());
    expect(hook.result.current.phase).toBe("ended");
    expect(JSON.parse(sock.sent.at(-1) as string)).toEqual({ type: "end" });
    expect(mic.stop).toHaveBeenCalled();
  });

  it("goes to error on gateway error", async () => {
    const { sock, hook } = setup();
    let p!: Promise<void>;
    act(() => {
      p = hook.result.current.start();
    });
    act(() => sock.open());
    await act(async () => {
      sock.emit({ type: "error", code: "auth_failed", message: "bad token" });
      await p;
    });
    await waitFor(() => expect(hook.result.current.phase).toBe("error"));
    expect(hook.result.current.error).toBe("bad token");
  });

  async function goLive(h: ReturnType<typeof setup>) {
    let p!: Promise<void>;
    act(() => {
      p = h.hook.result.current.start();
    });
    act(() => h.sock.open());
    await act(async () => {
      h.sock.emit(ready);
      await p;
    });
  }

  it("stop() while connecting ends cleanly, not error", async () => {
    const h = setup();
    let p!: Promise<void>;
    act(() => {
      p = h.hook.result.current.start();
    });
    act(() => h.sock.open());
    await act(async () => {
      h.hook.result.current.stop();
      await p;
    });
    expect(h.hook.result.current.phase).toBe("ended");
    expect(h.hook.result.current.error).toBeNull();
  });

  it("ended event moves phase to ended and closes", async () => {
    const h = setup();
    await goLive(h);
    act(() => h.sock.emit({ type: "ended", reason: "assistant" }));
    expect(h.hook.result.current.phase).toBe("ended");
    expect(h.sock.closeCode).toBe(1000);
  });

  it("mid-call error tears down mic and socket", async () => {
    const h = setup();
    await goLive(h);
    act(() => h.sock.emit({ type: "error", code: "quota", message: "out of minutes" }));
    expect(h.hook.result.current.phase).toBe("error");
    expect(h.hook.result.current.error).toBe("out of minutes");
    expect(h.mic.stop).toHaveBeenCalled();
    expect(h.sock.closeCode).not.toBeNull();
  });

  it("unmount cleans up", async () => {
    const h = setup();
    await goLive(h);
    h.hook.unmount();
    expect(h.mic.stop).toHaveBeenCalled();
    expect(h.player.close).toHaveBeenCalled();
    expect(h.sock.closeCode).toBe(1000);
  });

  it("tracks repeated same-name tools separately", async () => {
    const h = setup();
    await goLive(h);
    act(() => {
      for (const [status, summary] of [
        ["started", "1"],
        ["done", "1d"],
        ["started", "2"],
        ["failed", "2f"],
      ] as const)
        h.sock.emit({ type: "tool", name: "find_slots", status, summary });
    });
    expect(h.hook.result.current.tools).toEqual([
      { name: "find_slots", status: "done", summary: "1d" },
      { name: "find_slots", status: "failed", summary: "2f" },
    ]);
  });
});
