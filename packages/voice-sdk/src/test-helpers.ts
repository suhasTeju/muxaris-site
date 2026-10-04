import type { SocketLike } from "./client.js";

export class FakeSocket implements SocketLike {
  binaryType = "blob";
  readyState = 0;
  onopen: SocketLike["onopen"] = null;
  onmessage: SocketLike["onmessage"] = null;
  onerror: SocketLike["onerror"] = null;
  onclose: SocketLike["onclose"] = null;
  sent: unknown[] = [];
  closeCode: number | null = null;
  send(d: unknown) {
    this.sent.push(d);
  }
  close(code = 1000) {
    if (this.readyState === 3) return;
    this.closeCode = code;
    this.readyState = 3;
    this.onclose?.({ code, reason: "" });
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  emit(e: object) {
    this.onmessage?.({ data: JSON.stringify(e) });
  }
  sentEvents(): { type: string }[] {
    return this.sent.filter((s): s is string => typeof s === "string").map((s) => JSON.parse(s));
  }
}

export const readyEvent = {
  type: "ready",
  callId: "k",
  assistantName: "Asha",
  greeting: "hi",
  language: "en-IN",
} as const;
