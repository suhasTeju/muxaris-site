import WebSocket from "ws";

/** The subset of `ws` WebSocket the Sarvam adapters use (stubbable in tests). */
export interface WsLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, cb: (...args: any[]) => void): unknown;
  send(data: string): void;
  close(): void;
}
export type WsFactory = (url: string, headers: Record<string, string>) => WsLike;

export const defaultWsFactory: WsFactory = (url, headers) => new WebSocket(url, { headers });

export function sarvamHeaders(apiKey: string): Record<string, string> {
  return { "Api-Subscription-Key": apiKey };
}

export function toError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

/** Single-consumer async queue that can be ended or failed. */
export class AsyncQueue<T> implements AsyncIterable<T> {
  private items: T[] = [];
  private waiter: (() => void) | null = null;
  private ended = false;
  private failure: Error | null = null;

  push(item: T): void {
    if (this.ended) return;
    this.items.push(item);
    this.wake();
  }
  end(): void {
    this.ended = true;
    this.wake();
  }
  fail(err: Error): void {
    if (this.ended) return;
    this.failure = err;
    this.ended = true;
    this.wake();
  }
  private wake(): void {
    const w = this.waiter;
    this.waiter = null;
    w?.();
  }
  async *[Symbol.asyncIterator](): AsyncGenerator<T> {
    for (;;) {
      if (this.items.length > 0) {
        yield this.items.shift() as T;
        continue;
      }
      if (this.failure) throw this.failure;
      if (this.ended) return;
      await new Promise<void>((resolve) => {
        this.waiter = resolve;
      });
    }
  }
}
