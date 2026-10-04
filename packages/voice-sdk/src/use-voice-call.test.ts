import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { parseGatewayEvent, type SocketLike } from "./client.js";
import { useVoiceCall } from "./use-voice-call.js";

class FakeSocket implements SocketLike {
  binaryType = "blob";
  readyState = 0;
  onopen: SocketLike["onopen"] = null;
  onmessage: SocketLike["onmessage"] = null;
  onerror: SocketLike["onerror"] = null;
  onclose: SocketLike["onclose"] = null;
  sent: unknown[] = [];
  send(d: unknown) {
    this.sent.push(d);
  }
  close(code = 1000) {
    this.readyState = 3;
    this.onclose?.({ code, reason: "" });
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  emit(e: object) {
    this.onmessage?.({ data: JSON.stringify(e) });
  }
}

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
const ready = {
  type: "ready",
  callId: "k",
  assistantName: "Asha",
  greeting: "hi",
  language: "en-IN",
};

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
});
