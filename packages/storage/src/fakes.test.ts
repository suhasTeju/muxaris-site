import { describe, expect, it } from "vitest";
import { FakeBlobStore, FakeQueue } from "./fakes.js";

describe("fakes", () => {
  it("blob store round-trips and presigns", async () => {
    const s = new FakeBlobStore();
    await s.put("k", Buffer.from("abc"), "audio/wav");
    expect((await s.head("k"))?.size).toBe(3);
    expect(await s.presignGet("k", 600)).toMatch(/^fake:\/\/k\?ttl=600/);
    await s.delete("k");
    expect(await s.head("k")).toBeNull();
  });
  it("queue delivers once per receive and deletes by handle", async () => {
    const q = new FakeQueue<{ n: number }>();
    await q.send({ n: 1 });
    const [m] = await q.receive({ max: 10, waitSeconds: 0 });
    expect(m?.body.n).toBe(1);
    await q.delete(m!.handle);
    expect(await q.receive({ max: 10, waitSeconds: 0 })).toEqual([]);
  });
  it("redelivers unacked messages", async () => {
    const q = new FakeQueue<{ n: number }>();
    await q.send({ n: 1 });
    expect(await q.receive({ max: 10, waitSeconds: 0 })).toHaveLength(1);
    q.redeliver();
    expect(await q.receive({ max: 10, waitSeconds: 0 })).toHaveLength(1);
  });
});
