import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import { mulawEncode } from "./mulaw.js";
import { TwilioMediaStreamTransport } from "./twilio-transport.js";

class FakeWs extends EventEmitter {
  OPEN = 1;
  readyState = 1;
  bufferedAmount = 0;
  sent: string[] = [];
  closedWith: number | undefined;
  send(d: string) {
    this.sent.push(d);
  }
  close(code?: number) {
    this.closedWith = code;
    this.readyState = 3;
    this.emit("close");
  }
  recv(o: unknown) {
    this.emit("message", Buffer.from(JSON.stringify(o)), false);
  }
}

const mk = (opts?: { startTimeoutMs?: number }) => {
  const ws = new FakeWs();
  const t = new TwilioMediaStreamTransport(ws as unknown as WebSocket, opts);
  return { ws, t };
};
const start = {
  event: "start",
  streamSid: "MZ1",
  start: {
    streamSid: "MZ1",
    callSid: "CA1",
    customParameters: { token: "tok", from: "+15551230000" },
  },
};
const parsed = (ws: FakeWs) => ws.sent.map((s) => JSON.parse(s) as Record<string, unknown>);

describe("TwilioMediaStreamTransport", () => {
  it("resolves onceStarted from the start event", async () => {
    const { ws, t } = mk();
    ws.recv({ event: "connected" });
    ws.recv(start);
    await expect(t.onceStarted()).resolves.toEqual({
      callSid: "CA1",
      token: "tok",
      from: "+15551230000",
    });
  });

  it("rejects onceStarted after the timeout and when the socket closes first", async () => {
    vi.useFakeTimers();
    const a = mk({ startTimeoutMs: 100 });
    const p = a.t.onceStarted();
    const assertion = expect(p).rejects.toThrow(/not received/);
    await vi.advanceTimersByTimeAsync(150);
    await assertion;
    vi.useRealTimers();
    const b = mk();
    const q = b.t.onceStarted();
    b.ws.emit("close");
    await expect(q).rejects.toThrow(/closed/);
    b.t.close();
  });

  it("decodes inbound media to 16 kHz PCM, buffering until a consumer registers", () => {
    const { ws, t } = mk();
    ws.recv(start);
    const mu = mulawEncode(new Int16Array(160).fill(1000));
    ws.recv({ event: "media", media: { payload: Buffer.from(mu).toString("base64") } });
    const got: Buffer[] = [];
    t.onInboundAudio((b) => got.push(b));
    ws.recv({ event: "media", media: { payload: Buffer.from(mu).toString("base64") } });
    expect(got).toHaveLength(2);
    expect(got[0]!.length).toBe(160 * 2 * 2);
    expect(Math.abs(got[1]!.readInt16LE(0) - 1000)).toBeLessThan(40);
  });

  it("encodes outbound 24 kHz PCM to 160-byte base64 media frames", () => {
    const { ws, t } = mk();
    ws.recv(start);
    // 20 ms @24k = 480 samples -> 160 mulaw bytes; 50 ms -> 400 bytes in 3 frames.
    const pcm = Buffer.alloc(1200 * 2);
    t.sendAudio(pcm);
    const frames = parsed(ws);
    expect(frames).toHaveLength(3);
    const sizes = frames.map(
      (f) => Buffer.from((f.media as { payload: string }).payload, "base64").length,
    );
    expect(sizes).toEqual([160, 160, 80]);
    expect(frames[0]).toMatchObject({ event: "media", streamSid: "MZ1" });
  });

  it("maps flush_playback to clear and drops other events", () => {
    const { ws, t } = mk();
    ws.recv(start);
    t.sendEvent({ type: "flush_playback" });
    t.sendEvent({ type: "error", code: "internal", message: "x" });
    expect(parsed(ws)).toEqual([{ event: "clear", streamSid: "MZ1" }]);
  });

  it("emits end on stop, runs close callbacks and closes the socket", () => {
    const { ws, t } = mk();
    ws.recv(start);
    const ev = vi.fn();
    const closed = vi.fn();
    const hook = vi.fn();
    t.onClientEvent(ev);
    t.onClose(closed);
    t.onceClosed(hook);
    ws.recv({ event: "stop" });
    expect(ev).toHaveBeenCalledWith({ type: "end" });
    t.close();
    t.close();
    expect(ws.closedWith).toBe(1000);
    expect(closed).toHaveBeenCalledTimes(1);
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it("ignores audio before start and garbage frames", () => {
    const { ws, t } = mk();
    t.sendAudio(Buffer.alloc(960));
    ws.emit("message", Buffer.from("not json"), false);
    expect(ws.sent).toHaveLength(0);
    t.close();
  });
});
