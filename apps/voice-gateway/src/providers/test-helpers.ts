import { EventEmitter } from "node:events";
import type { WsLike } from "./ws-util.js";

export class StubWs extends EventEmitter implements WsLike {
  sent: string[] = [];
  closed = false;
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
  }
  json(): Array<Record<string, unknown>> {
    return this.sent.map((s) => JSON.parse(s) as Record<string, unknown>);
  }
}
