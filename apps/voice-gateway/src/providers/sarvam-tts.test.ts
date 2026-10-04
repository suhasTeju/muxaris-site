import { describe, expect, it } from "vitest";
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
