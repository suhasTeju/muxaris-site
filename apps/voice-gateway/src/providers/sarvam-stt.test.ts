import { describe, expect, it, vi } from "vitest";
import { SarvamStt, STT_FRAME_BYTES } from "./sarvam-stt.js";
import { StubWs } from "./test-helpers.js";

async function setup() {
  const ws = new StubWs();
  const factory = vi.fn(() => ws);
  const p = new SarvamStt({ apiKey: "k", wsFactory: factory });
  const opening = p.open();
  ws.emit("open");
  const stream = await opening;
  return { ws, stream, factory };
}
const frames = (ws: StubWs) =>
  ws
    .json()
    .filter((m) => "audio" in m)
    .map((m) => Buffer.from((m["audio"] as { data: string }).data, "base64"));

describe("SarvamStt", () => {
  it("connects with the api key header", async () => {
    const { factory } = await setup();
    expect(factory).toHaveBeenCalledWith(
      expect.stringContaining("speech-to-text/ws?model=saaras:v4"),
      { "Api-Subscription-Key": "k" },
    );
  });

  it("rejects open when the socket errors", async () => {
    const ws = new StubWs();
    const opening = new SarvamStt({ apiKey: "k", wsFactory: () => ws }).open();
    ws.emit("error", new Error("Unexpected server response: 403"));
    await expect(opening).rejects.toThrow("403");
  });

  it("splits large buffers and concatenates small ones into 3200-byte frames", async () => {
    const { ws, stream } = await setup();
    stream.sendAudio(Buffer.alloc(1000, 1));
    expect(frames(ws)).toHaveLength(0);
    stream.sendAudio(Buffer.alloc(2200, 1));
    expect(frames(ws)).toHaveLength(1);
    stream.sendAudio(Buffer.alloc(STT_FRAME_BYTES * 2 + 5, 2));
    const f = frames(ws);
    expect(f).toHaveLength(3);
    expect(f.every((b) => b.length === STT_FRAME_BYTES)).toBe(true);
    const first = ws.json()[0] as { audio: Record<string, string> };
    expect(first.audio["sample_rate"]).toBe("16000");
    expect(first.audio["encoding"]).toBe("audio/wav");
  });

  it("pads the remainder with zeros on end() then flushes", async () => {
    const { ws, stream } = await setup();
    stream.sendAudio(Buffer.alloc(100, 7));
    stream.end();
    const f = frames(ws);
    expect(f).toHaveLength(1);
    expect(f[0]!.length).toBe(STT_FRAME_BYTES);
    expect(f[0]!.subarray(0, 100).every((b) => b === 7)).toBe(true);
    expect(f[0]!.subarray(100).every((b) => b === 0)).toBe(true);
    expect(ws.json().at(-1)).toEqual({ type: "flush" });
  });

  it("sends only flush on end() with no pending audio", async () => {
    const { ws, stream } = await setup();
    stream.end();
    expect(ws.json()).toEqual([{ type: "flush" }]);
  });

  it("maps events, transcripts and errors", async () => {
    const { ws, stream } = await setup();
    const log: string[] = [];
    stream.on("speech_start", () => log.push("start"));
    stream.on("speech_end", () => log.push("end"));
    stream.on("transcript", (t) => log.push(`t:${t.text}:${t.language}`));
    stream.on("error", (e) => log.push(`e:${e.message}`));
    const send = (o: unknown) => ws.emit("message", Buffer.from(JSON.stringify(o)));
    send({ type: "events", data: { signal_type: "START_SPEECH", occured_at: 1 } });
    send({ type: "events", data: { signal_type: "END_SPEECH" } });
    send({ type: "data", data: { transcript: "hello", language_code: "en-IN" } });
    send({ type: "data", data: { transcript: "" } });
    send({ type: "error", data: { message: "boom" } });
    ws.emit("message", Buffer.from("not json"));
    expect(log).toEqual([
      "start",
      "end",
      "t:hello:en-IN",
      "t::undefined",
      expect.stringContaining("e:Sarvam STT error: boom"),
      expect.stringContaining("e:Sarvam STT sent non-JSON"),
    ]);
  });

  it("emits error if the socket closes before end(), not after", async () => {
    const a = await setup();
    const errs: Error[] = [];
    a.stream.on("error", (e) => errs.push(e));
    a.ws.emit("close");
    expect(errs).toHaveLength(1);

    const b = await setup();
    const errs2: Error[] = [];
    b.stream.on("error", (e) => errs2.push(e));
    b.stream.end();
    b.ws.emit("close");
    expect(errs2).toHaveLength(0);
  });

  it("close() closes the socket", async () => {
    const { ws, stream } = await setup();
    stream.close();
    expect(ws.closed).toBe(true);
  });
});
