import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { schema, newId, type Db } from "@muxaris/db";
import {
  appendTurn,
  createCall,
  finishCall,
  getCall,
  listCallbacks,
  setCallOutcomeByStaff,
} from "@muxaris/core";
import type { PostCallMessage } from "@muxaris/shared";
import { FakeQueue } from "@muxaris/storage/fakes";
import type { Analyser, Analysis } from "./analyse.js";
import { processMessage, runOnce } from "./handler.js";
import { dbReachable, makeTestClinic, openDb } from "./test-support.js";

const reachable = await dbReachable();
if (!reachable) console.warn("WARNING: Postgres unreachable, skipping post-call handler tests");

function stub(over: Partial<Analysis> = {}, calls: { n: number } = { n: 0 }): Analyser {
  return {
    async analyse() {
      calls.n++;
      return {
        summary: "Caller wants a callback about braces.",
        sentiment: "neutral",
        outcome: "callback",
        needsCallback: true,
        callbackReason: "Braces pricing",
        entities: { requestedService: "braces" },
        ...over,
      };
    },
  };
}

describe.skipIf(!reachable)("post-call handler", () => {
  let db: Db;
  let pool: { end(): Promise<void> };
  let clinicId: string;
  let cleanup: () => Promise<void>;
  const log = () => undefined;

  beforeAll(async () => {
    const o = openDb();
    db = o.db;
    pool = o.pool;
    const c = await makeTestClinic(db, "postcall");
    clinicId = c.clinic.id;
    cleanup = c.cleanup;
  });
  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  async function makeCall(opts: { phone?: string; users?: number; outcome?: "info" } = {}) {
    const call = await createCall(db, {
      clinicId,
      channel: "phone",
      ...(opts.phone ? { callerPhone: opts.phone } : {}),
    });
    const users = opts.users ?? 1;
    for (let i = 0; i < users; i++) {
      await appendTurn(db, { callId: call.id, clinicId, seq: i * 2, role: "user", text: "hello" });
      await appendTurn(db, {
        callId: call.id,
        clinicId,
        seq: i * 2 + 1,
        role: "assistant",
        text: "hi",
      });
    }
    await finishCall(db, {
      callId: call.id,
      clinicId,
      status: "completed",
      durationS: 30,
      ...(opts.outcome ? { outcome: opts.outcome } : {}),
    });
    return call;
  }
  const msg = (callId: string): PostCallMessage => ({
    type: "call.completed",
    clinicId,
    callId,
    endedAt: new Date().toISOString(),
    attempt: 1,
  });

  it("analyses, writes summary and creates one callback (phone from callerPhone)", async () => {
    const call = await makeCall({ phone: "+919876543210" });
    const r = await processMessage({ db, analyser: stub(), log }, msg(call.id));
    expect(r).toBe("analysed");
    const got = await getCall(db, clinicId, call.id);
    expect(got.call.summary).toContain("callback");
    expect(got.call.sentiment).toBe("neutral");
    expect(got.call.analysedAt).not.toBeNull();
    expect(got.call.outcome).toBe("callback");
    expect(got.callbacks).toHaveLength(1);
    expect(got.callbacks[0]?.reason).toBe("Braces pricing");
  });

  it("callback phone falls back to the linked patient", async () => {
    const [patient] = await db
      .insert(schema.patients)
      .values({ id: newId("pat"), clinicId, name: "Linked Patient", phone: "+919811122233" })
      .returning();
    const call = await makeCall();
    await db
      .update(schema.calls)
      .set({ patientId: patient!.id })
      .where(and(eq(schema.calls.id, call.id), eq(schema.calls.clinicId, clinicId)));
    expect(await processMessage({ db, analyser: stub(), log }, msg(call.id))).toBe("analysed");
    const { total } = await listCallbacks(db, clinicId, {
      status: "all",
      callId: call.id,
      limit: 5,
      offset: 0,
    });
    expect(total).toBe(1);
  });

  it("needsCallback with no phone creates no row and keeps analysis.needsCallback true", async () => {
    const call = await makeCall();
    expect(await processMessage({ db, analyser: stub(), log }, msg(call.id))).toBe("analysed");
    const got = await getCall(db, clinicId, call.id);
    expect(got.callbacks).toHaveLength(0);
    expect(got.call.analysis?.needsCallback).toBe(true);
  });

  it("second delivery is a no-op (skipped_already) and creates no second callback", async () => {
    const call = await makeCall({ phone: "+919876543211" });
    const calls = { n: 0 };
    const deps = { db, analyser: stub({}, calls), log };
    expect(await processMessage(deps, msg(call.id))).toBe("analysed");
    expect(await processMessage(deps, msg(call.id))).toBe("skipped_already");
    expect(calls.n).toBe(1);
    expect((await getCall(db, clinicId, call.id)).callbacks).toHaveLength(1);
  });

  it("staff outcome is never overwritten", async () => {
    const call = await makeCall({ phone: "+919876543212" });
    const user = await db.select().from(schema.users).limit(1);
    await setCallOutcomeByStaff(db, {
      clinicId,
      callId: call.id,
      outcome: "handoff",
      actorUserId: user[0]!.id,
    });
    expect(
      await processMessage({ db, analyser: stub({ outcome: "info" }), log }, msg(call.id)),
    ).toBe("analysed");
    expect((await getCall(db, clinicId, call.id)).call.outcome).toBe("handoff");
  });

  it("worker skips calls without user turns and deletes the message", async () => {
    const call = await makeCall({ users: 0 });
    const calls = { n: 0 };
    const q = new FakeQueue<PostCallMessage>();
    await q.send(msg(call.id));
    const n = await runOnce({ db, analyser: stub({}, calls), log }, q);
    expect(n).toBe(1);
    expect(calls.n).toBe(0);
    expect(q.deleted).toHaveLength(1);
    const after = (await getCall(db, clinicId, call.id)).call;
    expect(after.analysedAt).not.toBeNull();
    expect(after.summary).toBeNull();
    expect(await processMessage({ db, analyser: stub(), log }, msg(call.id))).toBe(
      "skipped_already",
    );
  });

  it("a failure before the analysis write is retried and still creates exactly one callback", async () => {
    const [patient] = await db
      .insert(schema.patients)
      .values({ id: newId("pat"), clinicId, name: "Retry Patient", phone: "+919822233344" })
      .returning();
    const call = await makeCall();
    await db
      .update(schema.calls)
      .set({ patientId: patient!.id })
      .where(and(eq(schema.calls.id, call.id), eq(schema.calls.clinicId, clinicId)));
    let thrown = false;
    const flaky = new Proxy(db, {
      get(target, prop, recv) {
        if (prop === "select") {
          return (...args: unknown[]) => {
            if (!thrown && (args[0] as { phone?: unknown } | undefined)?.phone) {
              thrown = true;
              throw new Error("transient");
            }
            return (target.select as (...a: unknown[]) => unknown).apply(target, args);
          };
        }
        return Reflect.get(target, prop, recv);
      },
    });
    expect(await processMessage({ db: flaky, analyser: stub(), log }, msg(call.id))).toBe("failed");
    expect((await getCall(db, clinicId, call.id)).call.analysedAt).toBeNull();
    expect(await processMessage({ db: flaky, analyser: stub(), log }, msg(call.id))).toBe(
      "analysed",
    );
    const got = await getCall(db, clinicId, call.id);
    expect(got.callbacks).toHaveLength(1);
    expect(got.call.summary).not.toBeNull();
  });

  it("failed analysis leaves the message in flight", async () => {
    const call = await makeCall({ phone: "+919876543213" });
    const failing: Analyser = {
      async analyse() {
        throw new Error("boom");
      },
    };
    const q = new FakeQueue<PostCallMessage>();
    await q.send(msg(call.id));
    await runOnce({ db, analyser: failing, log }, q);
    expect(q.deleted).toHaveLength(0);
    expect(q.inflight.size).toBe(1);
    q.redeliver();
    await runOnce({ db, analyser: stub(), log }, q);
    expect(q.deleted).toHaveLength(1);
  });
});
