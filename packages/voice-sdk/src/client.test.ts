import { describe, expect, it, vi } from "vitest";
import { VoiceClient } from "./client.js";
import { FakeSocket, openWhenReady, readyEvent } from "./test-helpers.js";

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
    await openWhenReady(sock);
    sock.close(1006);
    await expect(p).rejects.toThrow(/closed before ready/);
  });

  it("closes the socket when the gateway errors before ready", async () => {
    const { client, sock, mic } = make();
    const p = client.connect();
    await openWhenReady(sock);
    sock.emit({ type: "error", code: "auth_failed", message: "bad token" });
    await expect(p).rejects.toThrow("bad token");
    expect(sock.closeCode).not.toBeNull();
    expect(mic.stop).toHaveBeenCalled();
  });

  it("asks for the microphone before connecting; a denied mic never opens a socket", async () => {
    const mic = {
      start: vi.fn(async () => {
        throw new Error("denied");
      }),
      stop: vi.fn(),
    };
    const wsFactory = vi.fn(() => new FakeSocket());
    const { client } = make({ mediaFactory: () => mic, wsFactory });
    const errors: string[] = [];
    client.on("error", (e) => errors.push(e.message));
    await expect(client.connect()).rejects.toMatchObject({
      message: "denied",
      errorCode: "internal",
    });
    expect(wsFactory).not.toHaveBeenCalled();
    expect(mic.stop).toHaveBeenCalled();
    expect(errors).toEqual(["denied"]);
  });

  it("does not send mic frames before ready", async () => {
    const { client, sock, mic } = make();
    const p = client.connect();
    await openWhenReady(sock);
    const onFrame = (mic.start.mock.calls as unknown as Array<[(f: ArrayBuffer) => void]>)[0]![0];
    onFrame(new ArrayBuffer(4));
    expect(sock.sent).toHaveLength(1); // only the start frame
    sock.emit(readyEvent);
    await p;
    onFrame(new ArrayBuffer(4));
    expect(sock.sent).toHaveLength(2);
  });

  it.each([
    ["auth_failed", "auth"],
    ["forbidden", "auth"],
    ["busy", "busy"],
    ["quota", "quota"],
    ["not_implemented", "unsupported"],
    ["provider", "internal"],
    ["internal", "internal"],
  ] as const)("maps gateway error %s to errorCode %s", async (code, errorCode) => {
    const { client, sock } = make();
    const p = client.connect();
    await openWhenReady(sock);
    sock.emit({ type: "error", code, message: "m" });
    await expect(p).rejects.toMatchObject({ message: "m", errorCode });
  });

  it.each([
    [4001, "auth"],
    [4003, "auth"],
    [4029, "busy"],
    [1011, "internal"],
    [1006, "network"],
  ] as const)("maps close code %s before ready to errorCode %s", async (code, errorCode) => {
    const { client, sock } = make();
    const p = client.connect();
    await openWhenReady(sock);
    sock.close(code);
    await expect(p).rejects.toMatchObject({ errorCode });
  });

  it("end() is idempotent", async () => {
    const { client, sock } = make();
    const p = client.connect();
    await openWhenReady(sock);
    sock.emit(readyEvent);
    await p;
    client.end();
    client.end();
    expect(sock.sentEvents().filter((e) => e.type === "end")).toHaveLength(1);
  });

  it("end() after a failure is safe and does not resend", async () => {
    const { client, sock } = make();
    const p = client.connect();
    await openWhenReady(sock);
    sock.emit({ type: "error", code: "auth_failed", message: "bad token" });
    await expect(p).rejects.toThrow("bad token");
    expect(() => client.end()).not.toThrow();
    expect(sock.sentEvents().map((e) => e.type)).toEqual(["start"]);
  });

  it("does not start the connect timer while the mic permission prompt is pending", async () => {
    vi.useFakeTimers();
    try {
      let grant!: () => void;
      const mic = {
        start: vi.fn(() => new Promise<void>((r) => (grant = r))),
        stop: vi.fn(),
      };
      const wsFactory = vi.fn(() => sock);
      const { client, sock } = make({ mediaFactory: () => mic, wsFactory });
      const p = client.connect();
      await vi.advanceTimersByTimeAsync(30_000);
      expect(wsFactory).not.toHaveBeenCalled();
      grant();
      await vi.advanceTimersByTimeAsync(0);
      sock.open();
      sock.emit(readyEvent);
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
      const assertion = expect(p).rejects.toMatchObject({
        message: expect.stringMatching(/Timed out/),
        errorCode: "network",
      });
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
    const { client } = make({ mediaFactory: () => mic });
    const seen = vi.fn();
    client.on("error", seen);
    await expect(client.connect()).rejects.toThrow(/below/);
    expect(seen).toHaveBeenCalled();
  });
});
