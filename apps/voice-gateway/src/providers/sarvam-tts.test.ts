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
    const u = new SarvamTts({ apiKey: "k", wsFactory: () => ws, retryDelaysMs: [] }).speak(
      "Hi",
      opts,
    );
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
    const u = new SarvamTts({ apiKey: "k", wsFactory: () => ws, retryDelaysMs: [] }).speak(
      "Hi",
      opts,
    );
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
      const u = new SarvamTts({ apiKey: "k", wsFactory: () => ws, retryDelaysMs: [] }).speak(
        "Hi",
        opts,
      );
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
    const u = new SarvamTts({ apiKey: "k", wsFactory: () => ws, retryDelaysMs: [] }).speak(
      "Hi",
      opts,
    );
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

  describe("retry on connect failure", () => {
    const drain = async (u: { audio: AsyncIterable<Buffer> }) => {
      const got: number[][] = [];
      for await (const c of u.audio) got.push([...c]);
      return got;
    };
    const socks = (n: number) => Array.from({ length: n }, () => new StubWs());

    it("retries twice on a fresh socket (300 ms, then 900 ms) before giving up", async () => {
      vi.useFakeTimers();
      try {
        const all = socks(3);
        let i = 0;
        const factory = vi.fn(() => all[i++]!);
        const u = new SarvamTts({ apiKey: "k", wsFactory: factory }).speak("Hi", opts);
        const result = drain(u).then(
          () => "ok",
          (e: Error) => e.message,
        );
        all[0]!.emit("error", new Error("Unexpected server response: 503"));
        await vi.advanceTimersByTimeAsync(299);
        expect(factory).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(factory).toHaveBeenCalledTimes(2);
        all[1]!.emit("error", new Error("Unexpected server response: 429"));
        await vi.advanceTimersByTimeAsync(899);
        expect(factory).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(1);
        expect(factory).toHaveBeenCalledTimes(3);
        all[2]!.emit("error", new Error("Unexpected server response: 503"));
        expect(await result).toMatch(/503/);
        expect(factory).toHaveBeenCalledTimes(3);
        expect(all.every((w) => w.closed)).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it("plays the retried utterance when a later socket works", async () => {
      const all = socks(2);
      let i = 0;
      const u = new SarvamTts({
        apiKey: "k",
        wsFactory: () => all[i++]!,
        retryDelaysMs: [1, 1],
      }).speak("Hi", opts);
      const result = drain(u);
      all[0]!.emit("error", new Error("503"));
      await vi.waitFor(() => expect(i).toBe(2));
      all[1]!.emit("open");
      all[1]!.emit("message", audioMsg([7, 8]));
      all[1]!.emit("message", final);
      expect(await result).toEqual([[7, 8]]);
      expect(all[1]!.json()[1]).toEqual({ type: "text", data: { text: "Hi" } });
    });

    it("does not retry once audio has been produced", async () => {
      const all = socks(2);
      let i = 0;
      const factory = vi.fn(() => all[i++]!);
      const u = new SarvamTts({ apiKey: "k", wsFactory: factory, retryDelaysMs: [1, 1] }).speak(
        "Hi",
        opts,
      );
      const result = drain(u).then(
        () => "ok",
        (e: Error) => e.message,
      );
      all[0]!.emit("open");
      all[0]!.emit("message", audioMsg([1]));
      all[0]!.emit("close");
      expect(await result).toMatch(/closed before final/);
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it("cancel during the backoff wait stops further attempts", async () => {
      const all = socks(2);
      let i = 0;
      const factory = vi.fn(() => all[i++]!);
      const u = new SarvamTts({ apiKey: "k", wsFactory: factory, retryDelaysMs: [50, 50] }).speak(
        "Hi",
        opts,
      );
      const result = drain(u);
      all[0]!.emit("error", new Error("503"));
      await new Promise((r) => setTimeout(r, 10));
      u.cancel();
      expect(await result).toEqual([]);
      await new Promise((r) => setTimeout(r, 80));
      expect(factory).toHaveBeenCalledTimes(1);
    });
  });
});
