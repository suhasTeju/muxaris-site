import { describe, expect, it, vi } from "vitest";
import { VoiceClient } from "./client.js";
import { FakeSocket, readyEvent } from "./test-helpers.js";

function make(over: Partial<ConstructorParameters<typeof VoiceClient>[0]> = {}) {
  const sock = new FakeSocket();
  const mic = { start: vi.fn(async () => undefined), stop: vi.fn() };
  const player = { enqueue: vi.fn(), flush: vi.fn(), close: vi.fn(), prepare: vi.fn() };
  const client = new VoiceClient({
    url: "ws://x",
    token: "t",
    clinicId: "c",
    language: "en-IN",
    wsFactory: () => sock,
    mediaFactory: () => mic,
    playerFactory: () => player,
    ...over,
  });
  return { sock, mic, player, client };
}

describe("VoiceClient", () => {
  it("prepares the player eagerly on connect", () => {
    const { client, player, sock } = make();
    void client.connect().catch(() => undefined);
    expect(player.prepare).toHaveBeenCalled();
    sock.close();
  });

  it("rejects when the socket closes before ready", async () => {
    const { client, sock } = make();
    const p = client.connect();
    sock.open();
    sock.close(1006);
    await expect(p).rejects.toThrow(/closed before ready/);
  });

  it("closes the socket when the gateway errors before ready", async () => {
    const { client, sock, mic } = make();
    const p = client.connect();
    sock.open();
    sock.emit({ type: "error", code: "auth_failed", message: "bad token" });
    await expect(p).rejects.toThrow("bad token");
    expect(sock.closeCode).not.toBeNull();
    expect(mic.stop).toHaveBeenCalled();
  });

  it("sends end and closes the socket when the mic fails after ready", async () => {
    const mic = {
      start: vi.fn(async () => {
        throw new Error("denied");
      }),
      stop: vi.fn(),
    };
    const { client, sock } = make({ mediaFactory: () => mic });
    const errors: string[] = [];
    client.on("error", (e) => errors.push(e.message));
    const p = client.connect();
    sock.open();
    sock.emit(readyEvent);
    await expect(p).rejects.toThrow("denied");
    expect(sock.sentEvents().map((e) => e.type)).toEqual(["start", "end"]);
    expect(sock.closeCode).toBe(1011);
    expect(errors).toEqual(["denied"]);
  });

  it("end() is idempotent", async () => {
    const { client, sock } = make();
    const p = client.connect();
    sock.open();
    sock.emit(readyEvent);
    await p;
    client.end();
    client.end();
    expect(sock.sentEvents().filter((e) => e.type === "end")).toHaveLength(1);
  });

  it("end() after a failure is safe and does not resend", async () => {
    const { client, sock } = make();
    const p = client.connect();
    sock.open();
    sock.emit({ type: "error", code: "auth_failed", message: "bad token" });
    await expect(p).rejects.toThrow("bad token");
    expect(() => client.end()).not.toThrow();
    expect(sock.sentEvents().map((e) => e.type)).toEqual(["start"]);
  });

  it("does not time out while the mic permission prompt is pending", async () => {
    vi.useFakeTimers();
    try {
      let grant!: () => void;
      const mic = {
        start: vi.fn(() => new Promise<void>((r) => (grant = r))),
        stop: vi.fn(),
      };
      const { client, sock } = make({ mediaFactory: () => mic });
      const p = client.connect();
      sock.open();
      await vi.advanceTimersByTimeAsync(1000);
      sock.emit(readyEvent);
      await vi.advanceTimersByTimeAsync(14_000);
      grant();
      await expect(p).resolves.toBeUndefined();
      expect(sock.closeCode).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("times out waiting for ready", async () => {
    vi.useFakeTimers();
    try {
      const { client, sock } = make({ connectTimeoutMs: 50 });
      const p = client.connect();
      const assertion = expect(p).rejects.toThrow(/Timed out/);
      await vi.advanceTimersByTimeAsync(60);
      await assertion;
      expect(sock.closeCode).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a second connect()", async () => {
    const { client, sock } = make();
    void client.connect().catch(() => undefined);
    await expect(client.connect()).rejects.toThrow("already connected");
    sock.close();
  });

  it("surfaces an unsupported capture rate as an error event", async () => {
    const mic = {
      start: vi.fn(async () => {
        throw new Error("input rate 8000 is below 16000");
      }),
      stop: vi.fn(),
    };
    const { client, sock } = make({ mediaFactory: () => mic });
    const seen = vi.fn();
    client.on("error", seen);
    const p = client.connect();
    sock.open();
    sock.emit(readyEvent);
    await expect(p).rejects.toThrow(/below/);
    expect(seen).toHaveBeenCalled();
  });
});
