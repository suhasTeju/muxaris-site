/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  createCall,
  createClinicForUser,
  findAvailableSlots,
  getClinicContext,
  loadDemoClinicData,
  localDateString,
} from "@muxaris/core";
import { createDb, newId, schema, type Db } from "@muxaris/db";
import { eq } from "drizzle-orm";
import pg from "pg";
import type { ClientEvent, GatewayEvent } from "@muxaris/shared";
import type { ConverseMessage, LlmDelta, LlmProvider } from "../providers/types.js";
import type { MediaTransport } from "./transport.js";
import type { ClinicContext } from "./prompt.js";
import type { SessionLogger } from "./voice-session.js";

export const TEST_DB_URL =
  process.env.DATABASE_URL ?? "postgres://muxaris:muxaris@localhost:5433/muxaris";

export async function dbReachable(): Promise<boolean> {
  const client = new pg.Client({ connectionString: TEST_DB_URL, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

export function openDb(): { db: Db; pool: pg.Pool } {
  return createDb(TEST_DB_URL);
}

/** Throwaway clinic with the demo doctors/services. */
export async function makeDemoClinic(db: Db, label: string) {
  const tag = newId("usr").slice(4);
  const [user] = await db
    .insert(schema.users)
    .values({ id: newId("usr"), cognitoSub: `t6-${tag}`, email: `${label}-${tag}@example.test` })
    .returning();
  const { clinic } = await createClinicForUser(db, {
    userId: user!.id,
    name: `T6 ${label} ${tag}`,
    specialty: "dental",
    city: "Bengaluru",
  });
  await loadDemoClinicData(db, clinic.id);
  const ctx: ClinicContext = await getClinicContext(db, clinic.id);
  return {
    clinicId: clinic.id,
    ctx,
    newCall: async () => (await createCall(db, { clinicId: clinic.id, channel: "browser" })).id,
    cleanup: async () => {
      await db.delete(schema.clinics).where(eq(schema.clinics.id, clinic.id));
      await db.delete(schema.users).where(eq(schema.users.id, user!.id));
    },
  };
}

/** First day (from +2) the clinic is open with a free slot for the first bookable service. */
export async function firstOpenDay(db: Db, ctx: ClinicContext, now: Date) {
  const service = ctx.services.find((s) => s.bookableByAi)!;
  for (let i = 2; i < 12; i++) {
    const date = localDateString(new Date(now.getTime() + i * 86_400_000), ctx.clinic.timezone);
    const slots = await findAvailableSlots(db, {
      clinicId: ctx.clinic.id,
      date,
      serviceId: service.id,
      now,
      forAssistant: true,
    });
    if (slots.length) return { date, service, slots };
  }
  throw new Error("no open day found");
}

export type Logged = { kind: "audio"; bytes: number } | { kind: "event"; event: GatewayEvent };

export class TestTransport implements MediaTransport {
  log: Logged[] = [];
  closed = false;
  private inbound: Array<(b: Buffer) => void> = [];
  private clientCbs: Array<(e: ClientEvent) => void> = [];
  private closeCbs: Array<() => void> = [];
  onInboundAudio(cb: (b: Buffer) => void) {
    this.inbound.push(cb);
  }
  sendAudio(b: Buffer) {
    this.log.push({ kind: "audio", bytes: b.length });
  }
  /** Synchronous observer, e.g. to fire a barge-in at an exact moment. */
  hook: ((e: GatewayEvent) => void) | undefined;
  sendEvent(e: GatewayEvent) {
    this.log.push({ kind: "event", event: e });
    this.hook?.(e);
  }
  onClientEvent(cb: (e: ClientEvent) => void) {
    this.clientCbs.push(cb);
  }
  onClose(cb: () => void) {
    this.closeCbs.push(cb);
  }
  close() {
    this.closed = true;
  }
  events(): GatewayEvent[] {
    return this.log.flatMap((l) => (l.kind === "event" ? [l.event] : []));
  }
  ofType<T extends GatewayEvent["type"]>(t: T) {
    return this.events().filter((e): e is Extract<GatewayEvent, { type: T }> => e.type === t);
  }
  audioCount(): number {
    return this.log.filter((l) => l.kind === "audio").length;
  }
}

export const silentLog: SessionLogger = { info() {}, warn() {}, error() {} };

export async function waitFor(pred: () => boolean, ms = 15_000, label = "condition") {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error(`timeout waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Last tool result JSON in a message list (the model-visible tool output). */
export function lastToolResult(messages: ConverseMessage[]): Record<string, any> {
  for (let i = messages.length - 1; i >= 0; i--) {
    for (const b of messages[i]!.content ?? []) {
      const t = b.toolResult?.content?.[0]?.text;
      if (t) return JSON.parse(t) as Record<string, any>;
    }
  }
  return {};
}

/** LLM whose reply for call n is computed from the messages so far (so ids come from tool results). */
export class ScriptedLlm implements LlmProvider {
  calls = 0;
  constructor(private readonly steps: Array<(messages: ConverseMessage[]) => LlmDelta[]>) {}
  async *stream(req: { messages: ConverseMessage[]; signal: AbortSignal }) {
    const step = this.steps[this.calls++] ?? (() => [{ type: "text", text: "Okay." } as LlmDelta]);
    const deltas = step(req.messages);
    for (const d of deltas) yield d;
    yield {
      type: "done" as const,
      stopReason: deltas.some((d) => d.type === "tool_call") ? "tool_use" : "end_turn",
    };
  }
}

export const call = (id: string, name: any, input: unknown): LlmDelta => ({
  type: "tool_call",
  id,
  name,
  input,
});
