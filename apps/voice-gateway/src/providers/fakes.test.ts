import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeLlm, FakeStt, FakeTts } from "./fakes.js";
import type { LlmDelta } from "./types.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("FakeStt", () => {
  it("plays its script on timers and records audio", async () => {
    const stt = new FakeStt([
      { afterMs: 100, event: { type: "speech_start" } },
      { afterMs: 300, event: { type: "transcript", text: "hi", language: "en-IN" } },
    ]);
    const s = await stt.open();
    const log: string[] = [];
    s.on("speech_start", () => log.push("start"));
    s.on("transcript", (t) => log.push(t.text));
    s.sendAudio(Buffer.from([1]));
    s.end();
    await vi.advanceTimersByTimeAsync(150);
    expect(log).toEqual(["start"]);
    await vi.advanceTimersByTimeAsync(200);
    expect(log).toEqual(["start", "hi"]);
    expect(stt.streams[0]!.received).toHaveLength(1);
    expect(stt.streams[0]!.ended).toBe(true);
  });

  it("push emits immediately and close stops the script", async () => {
    const stt = new FakeStt([{ afterMs: 50, event: { type: "speech_end" } }]);
    const s = await stt.open();
    const log: string[] = [];
    s.on("speech_end", () => log.push("end"));
    s.on("error", (e) => log.push(e.message));
    stt.push({ type: "error", error: new Error("x") });
    s.close();
    await vi.advanceTimersByTimeAsync(100);
    expect(log).toEqual(["x"]);
  });
});

describe("FakeTts", () => {
  it("yields N chunks with delay", async () => {
    const tts = new FakeTts({ chunks: 3, chunkBytes: 4, delayMs: 10 });
    const u = tts.speak("hi", { language: "en-IN", speaker: "shubh" });
    const got: number[] = [];
    const done = (async () => {
      for await (const c of u.audio) got.push(c.length);
    })();
    await vi.advanceTimersByTimeAsync(25);
    expect(got).toEqual([4, 4]);
    await vi.advanceTimersByTimeAsync(10);
    await done;
    expect(got).toEqual([4, 4, 4]);
    expect(tts.spoken[0]!.text).toBe("hi");
  });

  it("cancel records the call and ends the iterable", async () => {
    const tts = new FakeTts({ chunks: 5, delayMs: 100 });
    const u = tts.speak("hi", { language: "en-IN", speaker: "shubh" });
    let n = 0;
    const done = (async () => {
      for await (const c of u.audio) n += c.length > 0 ? 1 : 0;
    })();
    await vi.advanceTimersByTimeAsync(150);
    u.cancel();
    await done;
    expect(n).toBe(1);
    expect(tts.cancelCalls).toBe(1);
  });
});

describe("FakeLlm", () => {
  const user = (t: string) => ({ role: "user" as const, content: [{ text: t }] });
  const run = async (llm: FakeLlm, t: string, signal = new AbortController().signal) => {
    const out: LlmDelta[] = [];
    for await (const d of llm.stream({ system: "s", messages: [user(t)], tools: [], signal }))
      out.push(d);
    return out;
  };

  it("uses scripted deltas by last user text and appends done", async () => {
    const llm = new FakeLlm({
      book: [{ type: "tool_call", id: "1", name: "find_slots", input: {} }],
    });
    expect(await run(llm, "book")).toEqual([
      { type: "tool_call", id: "1", name: "find_slots", input: {} },
      { type: "done", stopReason: "tool_use" },
    ]);
    expect(llm.requests).toHaveLength(1);
  });

  it("falls back to the default reply", async () => {
    expect(await run(new FakeLlm({}, "Sure."), "unknown")).toEqual([
      { type: "text", text: "Sure." },
      { type: "done", stopReason: "end_turn" },
    ]);
  });

  it("stops when aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    expect(await run(new FakeLlm(), "x", ac.signal)).toEqual([]);
  });
});
