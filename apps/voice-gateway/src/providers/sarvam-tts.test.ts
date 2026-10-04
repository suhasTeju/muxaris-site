import { describe, expect, it, vi } from "vitest";
import { SarvamTts } from "./sarvam-tts.js";
import { StubWs } from "./test-helpers.js";

const opts = { language: "en-IN", speaker: "shubh" } as const;
const audioMsg = (bytes: number[]) =>
  Buffer.from(
    JSON.stringify({
      type: "audio",
      data: { content_type: "audio/pcm", audio: Buffer.from(bytes).toString("base64") },
    }),
  );
const final = Buffer.from(JSON.stringify({ type: "event", data: { event_type: "final" } }));

describe("SarvamTts", () => {
  it("sends config, text, flush on open and yields audio until final", async () => {
    const ws = new StubWs();
    const tts = new SarvamTts({ apiKey: "k", wsFactory: () => ws });
    const u = tts.speak("Hello", opts);
    ws.emit("open");
    expect(ws.json()).toEqual([
      {
        type: "config",
        data: expect.objectContaining({
          language_code: "en-IN",
          speaker: "shubh",
          speech_sample_rate: 24000,
          output_audio_codec: "linear16",
        }),
      },
      { type: "text", data: { text: "Hello" } },
      { type: "flush" },
    ]);
    ws.emit("message", audioMsg([1, 2]));
    ws.emit("message", audioMsg([3]));
    ws.emit("message", final);
    const got: number[][] = [];
    for await (const c of u.audio) got.push([...c]);
    expect(got).toEqual([[1, 2], [3]]);
    expect(ws.closed).toBe(true);
  });

  it("cancel closes the socket and ends the iterable", async () => {
    const ws = new StubWs();
    const u = new SarvamTts({ apiKey: "k", wsFactory: () => ws }).speak("Hi", opts);
    ws.emit("open");
    const it = u.audio[Symbol.asyncIterator]();
    const next = it.next();
    u.cancel();
    expect(ws.closed).toBe(true);
    expect((await next).done).toBe(true);
    ws.emit("close"); // late close must not turn into an error
  });

  it("fails the iterable when the socket closes before final", async () => {
    const ws = new StubWs();
    const u = new SarvamTts({ apiKey: "k", wsFactory: () => ws }).speak("Hi", opts);
    ws.emit("open");
    ws.emit("close");
    await expect(
      (async () => {
        for await (const c of u.audio) void c;
      })(),
    ).rejects.toThrow("closed before final");
  });

  it("fails on error messages", async () => {
    const ws = new StubWs();
    const u = new SarvamTts({ apiKey: "k", wsFactory: () => ws }).speak("Hi", opts);
    ws.emit("message", Buffer.from(JSON.stringify({ type: "error", data: { message: "bad" } })));
    await expect(
      (async () => {
        for await (const c of u.audio) void c;
      })(),
    ).rejects.toThrow("bad");
  });

  it("sends the key as header and subprotocol", () => {
    const ws = new StubWs();
    const factory = vi.fn(() => ws);
    new SarvamTts({ apiKey: "k", wsFactory: factory }).speak("Hi", opts);
    expect(factory).toHaveBeenCalledWith(expect.any(String), { "Api-Subscription-Key": "k" }, [
      "api-subscription-key.k",
    ]);
  });

  it("cancel drops buffered chunks", async () => {
    const ws = new StubWs();
    const u = new SarvamTts({ apiKey: "k", wsFactory: () => ws }).speak("Hi", opts);
    ws.emit("open");
    ws.emit("message", audioMsg([1]));
    ws.emit("message", audioMsg([2]));
    ws.emit("message", audioMsg([3]));
    u.cancel();
    const got: Buffer[] = [];
    for await (const c of u.audio) got.push(c);
    expect(got).toHaveLength(0);
  });

  it("consumer break closes the socket", async () => {
    const ws = new StubWs();
    const u = new SarvamTts({ apiKey: "k", wsFactory: () => ws }).speak("Hi", opts);
    ws.emit("open");
    ws.emit("message", audioMsg([1]));
    ws.emit("message", audioMsg([2]));
    for await (const c of u.audio) {
      void c;
      break;
    }
    expect(ws.closed).toBe(true);
  });

  it("errors after 10 s of silence", async () => {
    vi.useFakeTimers();
    try {
      const ws = new StubWs();
      const u = new SarvamTts({ apiKey: "k", wsFactory: () => ws }).speak("Hi", opts);
      ws.emit("open");
      const assertion = expect(
        (async () => {
          for await (const c of u.audio) void c;
        })(),
      ).rejects.toThrow("timed out");
      await vi.advanceTimersByTimeAsync(10_001);
      await assertion;
      expect(ws.closed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("error messages carry only a truncated message field", async () => {
    const ws = new StubWs();
    const u = new SarvamTts({ apiKey: "k", wsFactory: () => ws }).speak("Hi", opts);
    ws.emit(
      "message",
      Buffer.from(
        JSON.stringify({ type: "error", data: { text: "SECRET", message: "x".repeat(500) } }),
      ),
    );
    const err = await (async () => {
      try {
        for await (const c of u.audio) void c;
      } catch (e) {
        return e as Error;
      }
      return new Error("none");
    })();
    expect(err.message).not.toContain("SECRET");
    expect(err.message.length).toBeLessThan(160);
  });

  it("preview concatenates all audio", async () => {
    const ws = new StubWs();
    const tts = new SarvamTts({ apiKey: "k", wsFactory: () => ws });
    const p = tts.preview("Hi", opts);
    ws.emit("open");
    ws.emit("message", audioMsg([1, 2]));
    ws.emit("message", audioMsg([3]));
    ws.emit("message", final);
    expect([...(await p)]).toEqual([1, 2, 3]);
  });
});
