import type { Readable } from "node:stream";
import type { BlobStore } from "./blob-store.js";
import type { JobQueue } from "./queue.js";

export class FakeBlobStore implements BlobStore {
  objects = new Map<string, { body: Buffer; contentType: string }>();
  presigned: string[] = [];

  async put(key: string, body: Buffer | Readable, contentType: string): Promise<void> {
    let buf: Buffer;
    if (Buffer.isBuffer(body)) {
      buf = body;
    } else {
      const chunks: Buffer[] = [];
      for await (const c of body) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c as string));
      buf = Buffer.concat(chunks);
    }
    this.objects.set(key, { body: buf, contentType });
  }

  async presignGet(key: string, ttlSeconds: number): Promise<string> {
    const url = `fake://${key}?ttl=${ttlSeconds}`;
    this.presigned.push(url);
    return url;
  }

  async head(key: string): Promise<{ size: number } | null> {
    const o = this.objects.get(key);
    return o ? { size: o.body.length } : null;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

/** At-least-once: received messages stay in flight until deleted and are returned again. */
export class FakeQueue<T> implements JobQueue<T> {
  sent: T[] = [];
  pending: T[] = [];
  deleted: string[] = [];
  extended: Array<{ handle: string; seconds: number }> = [];
  inflight = new Map<string, T>();
  private n = 0;

  async send(msg: T): Promise<void> {
    this.sent.push(msg);
    this.pending.push(msg);
  }

  async receive(opts: { max: number; waitSeconds: number }) {
    const out: Array<{ handle: string; body: T }> = [];
    for (const [handle, body] of this.inflight) {
      if (out.length >= opts.max) break;
      out.push({ handle, body });
    }
    while (out.length < opts.max && this.pending.length > 0) {
      const body = this.pending.shift() as T;
      const handle = `h-${++this.n}`;
      this.inflight.set(handle, body);
      out.push({ handle, body });
    }
    return out;
  }

  async delete(handle: string): Promise<void> {
    this.inflight.delete(handle);
    this.deleted.push(handle);
  }

  async extendVisibility(handle: string, seconds: number): Promise<void> {
    this.extended.push({ handle, seconds });
  }

  /** Put all in-flight messages back on the pending list (visibility timeout expiry). */
  redeliver(): void {
    for (const body of this.inflight.values()) this.pending.push(body);
    this.inflight.clear();
  }
}
