import { describe, expect, it, vi } from "vitest";
import { PcmPlayer, type AudioContextLike } from "./playback.js";

function fakeCtx() {
  const sources: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
  const ctx = {
    currentTime: 1,
    destination: {},
    createBuffer: vi.fn((_c: number, len: number, rate: number) => ({
      duration: len / rate,
      copyToChannel: vi.fn(),
    })),
    createBufferSource: vi.fn(() => {
      const s = { buffer: null, onended: null, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
      sources.push(s);
      return s;
    }),
  };
  return { ctx: ctx as unknown as AudioContextLike & typeof ctx, sources };
}
const chunk = (samples: number) => new Int16Array(samples).buffer; // 2400 samples = 0.1 s

describe("PcmPlayer", () => {
  it("schedules chunks back to back, starting 80 ms ahead", () => {
    const { ctx, sources } = fakeCtx();
    const p = new PcmPlayer(() => ctx);
    p.enqueue(chunk(2400));
    p.enqueue(chunk(2400));
    expect(sources[0]!.start).toHaveBeenCalledWith(expect.closeTo(1.08, 6));
    expect(sources[1]!.start).toHaveBeenCalledWith(expect.closeTo(1.18, 6));
    expect(ctx.createBuffer).toHaveBeenCalledWith(1, 2400, 24000);
  });
  it("catches up when the queue ran dry", () => {
    const { ctx, sources } = fakeCtx();
    const p = new PcmPlayer(() => ctx);
    p.enqueue(chunk(2400));
    ctx.currentTime = 5;
    p.enqueue(chunk(2400));
    expect(sources[1]!.start).toHaveBeenCalledWith(expect.closeTo(5.08, 6));
  });
  it("flush stops all live sources and resets the clock", () => {
    const { ctx, sources } = fakeCtx();
    const p = new PcmPlayer(() => ctx);
    p.enqueue(chunk(2400));
    p.enqueue(chunk(2400));
    p.flush();
    expect(sources[0]!.stop).toHaveBeenCalled();
    expect(sources[1]!.stop).toHaveBeenCalled();
    p.enqueue(chunk(2400));
    expect(sources[2]!.start).toHaveBeenCalledWith(expect.closeTo(1.08, 6));
  });
  it("ignores empty chunks", () => {
    const { ctx } = fakeCtx();
    new PcmPlayer(() => ctx).enqueue(new ArrayBuffer(1));
    expect(ctx.createBufferSource).not.toHaveBeenCalled();
  });
});
