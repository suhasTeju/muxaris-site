import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { schema } from "@muxaris/db";
import {
  appendTurn,
  createCall,
  createCallback,
  finishCall,
  getCall,
  getCallTranscript,
  getOverviewStats,
  listCallbacks,
  listCalls,
  markCallAnalysed,
  purgeExpiredCalls,
  purgeExpiredCallbacks,
  revealCallbackPhone,
  setCallOutcomeByStaff,
  setCallRecording,
  sweepStaleCalls,
  updateCallAnalysis,
  updateCallback,
} from "./calls.js";
import { createPatient } from "./patients.js";
import { recordCallUsage, usageMonth } from "./usage.js";
import { dbReachable, makeTestClinic, openDb, warnIfUnreachable } from "./test-support.js";

const { db, pool } = openDb();
const reachable = await dbReachable();
warnIfUnreachable(reachable, "core call-centre tests");

const analysis = (needsCallback = false) => ({ entities: {}, needsCallback, model: "test-model" });

(reachable ? describe : describe.skip)("call centre services", () => {
  let a: Awaited<ReturnType<typeof makeTestClinic>>;
  let b: Awaited<ReturnType<typeof makeTestClinic>>;
  beforeAll(async () => {
    a = await makeTestClinic(db, "cc-a");
    try {
      b = await makeTestClinic(db, "cc-b");
    } catch (e) {
      await a.cleanup();
      throw e;
    }
  });
  afterAll(async () => {
    await a?.cleanup();
    await b?.cleanup();
    await pool.end();
  });

  async function finished(clinicId: string, outcome?: Parameters<typeof finishCall>[1]["outcome"]) {
    const c = await createCall(db, { clinicId, channel: "browser" });
    await finishCall(db, {
      callId: c.id,
      clinicId,
      status: "completed",
      durationS: 60,
      ...(outcome ? { outcome } : {}),
    });
    return c.id;
  }

  it("finishCall marks gateway outcome source", async () => {
    const id = await finished(a.clinic.id, "info");
    const { call } = await getCall(db, a.clinic.id, id);
    expect(call.outcomeSource).toBe("gateway");
    const id2 = await finished(a.clinic.id);
    expect((await getCall(db, a.clinic.id, id2)).call.outcomeSource).toBeNull();
  });

  it("listCalls filters by outcome and returns total, newest first", async () => {
    const t = await makeTestClinic(db, "cc-list");
    try {
      const ids: string[] = [];
      for (const o of ["booked", "info", "booked"] as const) {
        ids.push(await finished(t.clinic.id, o));
        await new Promise((r) => setTimeout(r, 5));
      }
      const r = await listCalls(db, t.clinic.id, { outcome: "booked", limit: 10, offset: 0 });
      expect(r.total).toBe(2);
      expect(r.calls.map((c) => c.id)).toEqual([ids[2], ids[0]]);
      const page = await listCalls(db, t.clinic.id, { limit: 1, offset: 1 });
      expect(page.total).toBe(3);
      expect(page.calls).toHaveLength(1);
      const none = await listCalls(db, t.clinic.id, {
        from: new Date(Date.now() + 3600_000),
        limit: 10,
        offset: 0,
      });
      expect(none.total).toBe(0);
    } finally {
      await t.cleanup();
    }
  });

  it("getCall returns ordered turns and callbacks; cross-tenant is not_found", async () => {
    const c = await createCall(db, { clinicId: a.clinic.id, channel: "browser" });
    await appendTurn(db, {
      callId: c.id,
      clinicId: a.clinic.id,
      seq: 2,
      role: "assistant",
      text: "b",
    });
    await appendTurn(db, { callId: c.id, clinicId: a.clinic.id, seq: 1, role: "user", text: "a" });
    await createCallback(db, {
      clinicId: a.clinic.id,
      callId: c.id,
      phone: "+919876543210",
      reason: "call me",
    });
    const r = await getCall(db, a.clinic.id, c.id);
    expect(r.turns.map((t) => t.seq)).toEqual([1, 2]);
    expect(r.callbacks).toHaveLength(1);
    expect(r.callbacks[0]).toHaveProperty("phoneMasked");
    expect(r.callbacks[0]).not.toHaveProperty("phone");
    await expect(getCall(db, b.clinic.id, c.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("setCallRecording updates status and keys, tenant scoped", async () => {
    const c = await createCall(db, { clinicId: a.clinic.id, channel: "browser" });
    await setCallRecording(db, {
      clinicId: a.clinic.id,
      callId: c.id,
      status: "ready",
      recordingS3Key: "r.wav",
      transcriptS3Key: "t.json",
    });
    const { call } = await getCall(db, a.clinic.id, c.id);
    expect(call).toMatchObject({
      recordingStatus: "ready",
      recordingS3Key: "r.wav",
      transcriptS3Key: "t.json",
    });
    await expect(
      setCallRecording(db, { clinicId: b.clinic.id, callId: c.id, status: "failed" }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("markCallAnalysed sets analysedAt and leaves summary and sentiment null", async () => {
    const id = await finished(a.clinic.id);
    const r = await markCallAnalysed(db, {
      clinicId: a.clinic.id,
      callId: id,
      reason: "no_turns",
      model: "none",
    });
    expect(r.applied).toBe(true);
    const { call } = await getCall(db, a.clinic.id, id);
    expect(call.summary).toBeNull();
    expect(call.sentiment).toBeNull();
    expect(call.analysedAt).not.toBeNull();
    expect(call.analysis?.skipped).toBe("no_turns");
  });

  it("updateCallAnalysis refines only gateway outcomes", async () => {
    const A = await finished(a.clinic.id, "info");
    const B = await finished(a.clinic.id, "booked");
    const C = await finished(a.clinic.id, "info");
    await setCallOutcomeByStaff(db, {
      clinicId: a.clinic.id,
      callId: C,
      outcome: "handoff",
      actorUserId: a.user.id,
    });

    const ra = await updateCallAnalysis(db, {
      clinicId: a.clinic.id,
      callId: A,
      summary: "sa",
      sentiment: "positive",
      analysis: analysis(true),
      outcome: "callback",
      model: "m",
    });
    expect(ra.applied).toBe(true);
    const ca = (await getCall(db, a.clinic.id, A)).call;
    expect(ca).toMatchObject({ outcome: "callback", outcomeSource: "worker", summary: "sa" });
    expect(ca.analysedAt).toBeInstanceOf(Date);

    await updateCallAnalysis(db, {
      clinicId: a.clinic.id,
      callId: B,
      summary: "sb",
      sentiment: "neutral",
      analysis: analysis(),
      outcome: "info",
      model: "m",
    });
    expect((await getCall(db, a.clinic.id, B)).call).toMatchObject({
      outcome: "booked",
      outcomeSource: "gateway",
      summary: "sb",
    });

    await updateCallAnalysis(db, {
      clinicId: a.clinic.id,
      callId: C,
      summary: "sc",
      sentiment: "negative",
      analysis: analysis(),
      outcome: "callback",
      model: "m",
    });
    expect((await getCall(db, a.clinic.id, C)).call).toMatchObject({
      outcome: "handoff",
      outcomeSource: "staff",
      summary: "sc",
    });

    // A second worker run must not overwrite an already worker-refined outcome.
    await updateCallAnalysis(db, {
      clinicId: a.clinic.id,
      callId: A,
      summary: "sa2",
      sentiment: "neutral",
      analysis: analysis(),
      outcome: "handoff",
      model: "m",
    });
    const ca2 = (await getCall(db, a.clinic.id, A)).call;
    expect(ca2).toMatchObject({ outcome: "callback", outcomeSource: "worker", summary: "sa2" });
    expect(ca2.analysedAt!.getTime()).toBeGreaterThanOrEqual(ca.analysedAt!.getTime());

    const other = await updateCallAnalysis(db, {
      clinicId: b.clinic.id,
      callId: A,
      summary: "x",
      sentiment: "neutral",
      analysis: analysis(),
      model: "m",
    });
    expect(other.applied).toBe(false);
  });

  it("setCallOutcomeByStaff writes an audit_log row with from/to", async () => {
    const id = await finished(a.clinic.id, "info");
    const row = await setCallOutcomeByStaff(db, {
      clinicId: a.clinic.id,
      callId: id,
      outcome: "booked",
      actorUserId: a.user.id,
    });
    expect(row).toMatchObject({ outcome: "booked", outcomeSource: "staff" });
    const [log] = await db.select().from(schema.auditLog).where(eq(schema.auditLog.entityId, id));
    expect(log).toMatchObject({
      action: "call.outcome.edit",
      entity: "call",
      clinicId: a.clinic.id,
      actorId: a.user.id,
      data: { from: "info", to: "booked" },
    });
    await expect(
      setCallOutcomeByStaff(db, {
        clinicId: b.clinic.id,
        callId: id,
        outcome: "info",
        actorUserId: b.user.id,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("getCallTranscript strips tool args and computes offsets", async () => {
    const c = await createCall(db, { clinicId: a.clinic.id, channel: "browser" });
    await appendTurn(db, { callId: c.id, clinicId: a.clinic.id, seq: 1, role: "user", text: "hi" });
    await appendTurn(db, {
      callId: c.id,
      clinicId: a.clinic.id,
      seq: 2,
      role: "tool",
      toolName: "book",
      toolArgs: { secret: 1 },
      toolResult: { secret: 2 },
    });
    await db.execute(
      sql`UPDATE call_turns SET started_at = (SELECT started_at FROM calls WHERE id = ${c.id}) + interval '2 seconds' WHERE call_id = ${c.id} AND seq = 2`,
    );
    const t = await getCallTranscript(db, a.clinic.id, c.id);
    expect(t.callId).toBe(c.id);
    expect(t.turns).toHaveLength(2);
    expect(t.turns[1]).toEqual({ seq: 2, role: "tool", toolName: "book", offsetMs: 2000 });
    expect(JSON.stringify(t)).not.toContain("secret");
    expect(t.turns[0]).toMatchObject({ seq: 1, role: "user", text: "hi" });
    await expect(getCallTranscript(db, b.clinic.id, c.id)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("listCallbacks masks phone and filters; updateCallback done sets doneAt", async () => {
    const t = await makeTestClinic(db, "cc-cb");
    try {
      const c = await createCall(db, { clinicId: t.clinic.id, channel: "browser" });
      const cb1 = await createCallback(db, {
        clinicId: t.clinic.id,
        callId: c.id,
        phone: "+919876543210",
        reason: "r1",
      });
      await createCallback(db, { clinicId: t.clinic.id, phone: "+919876543211", reason: "r2" });
      const open = await listCallbacks(db, t.clinic.id, { status: "open", limit: 10, offset: 0 });
      expect(open.total).toBe(2);
      expect(open.callbacks.every((x) => x.phoneMasked.includes("•"))).toBe(true);
      expect(JSON.stringify(open)).not.toContain("9876543210");
      const forCall = await listCallbacks(db, t.clinic.id, {
        status: "all",
        callId: c.id,
        limit: 10,
        offset: 0,
      });
      expect(forCall.total).toBe(1);

      const done = await updateCallback(db, {
        clinicId: t.clinic.id,
        callbackId: cb1.id,
        status: "done",
        note: "called",
      });
      expect(done).toHaveProperty("phoneMasked");
      expect(done).not.toHaveProperty("phone");
      expect(done.status).toBe("done");
      expect(done.doneAt).toBeInstanceOf(Date);
      expect(done.note).toBe("called");
      const reopened = await updateCallback(db, {
        clinicId: t.clinic.id,
        callbackId: cb1.id,
        status: "open",
        assignedTo: null,
      });
      expect(reopened.doneAt).toBeNull();
      expect(
        (await listCallbacks(db, t.clinic.id, { status: "done", limit: 10, offset: 0 })).total,
      ).toBe(0);
      await expect(
        updateCallback(db, { clinicId: a.clinic.id, callbackId: cb1.id, status: "done" }),
      ).rejects.toMatchObject({ code: "not_found" });
    } finally {
      await t.cleanup();
    }
  });

  it("getOverviewStats counts inside the day window only", async () => {
    const t = await makeTestClinic(db, "cc-stats");
    try {
      const inWin = await finished(t.clinic.id, "booked");
      await finished(t.clinic.id, "info");
      const old = await finished(t.clinic.id, "booked");
      await db
        .update(schema.calls)
        .set({ startedAt: new Date(Date.now() - 3 * 86400_000) })
        .where(eq(schema.calls.id, old));
      await createCallback(db, { clinicId: t.clinic.id, phone: "+919876543210", reason: "r" });
      const s = await getOverviewStats(db, t.clinic.id, {
        dayStart: new Date(Date.now() - 3600_000),
        dayEnd: new Date(Date.now() + 3600_000),
      });
      expect(inWin).toBeTruthy();
      expect(s).toEqual({
        callsToday: 2,
        bookedToday: 1,
        openCallbacks: 1,
        avgDurationS: 60,
        byOutcome: { booked: 1, info: 1 },
      });
      const empty = await getOverviewStats(db, t.clinic.id, {
        dayStart: new Date(Date.now() + 86400_000),
        dayEnd: new Date(Date.now() + 2 * 86400_000),
      });
      expect(empty).toMatchObject({ callsToday: 0, avgDurationS: null, byOutcome: {} });
    } finally {
      await t.cleanup();
    }
  });

  it("sweep abandons a 31-minute-old in_progress call but not a 5-minute-old one", async () => {
    const t = await makeTestClinic(db, "cc-sweep1");
    try {
      const now = new Date();
      const oldC = await createCall(db, { clinicId: t.clinic.id, channel: "phone" });
      const newC = await createCall(db, { clinicId: t.clinic.id, channel: "phone" });
      await db
        .update(schema.calls)
        .set({ startedAt: new Date(now.getTime() - 31 * 60_000) })
        .where(eq(schema.calls.id, oldC.id));
      await db
        .update(schema.calls)
        .set({ startedAt: new Date(now.getTime() - 5 * 60_000) })
        .where(eq(schema.calls.id, newC.id));
      const r = await sweepStaleCalls(db, { now });
      expect(r.abandoned).toBeGreaterThanOrEqual(1);
      const o = (await getCall(db, t.clinic.id, oldC.id)).call;
      expect(o).toMatchObject({
        status: "abandoned",
        outcome: "abandoned",
        outcomeSource: "gateway",
      });
      expect(o.endedAt).not.toBeNull();
      expect(o.durationS).toBe(0); // never-settled call with no turns: nothing real to bill
      expect((await getCall(db, t.clinic.id, newC.id)).call.status).toBe("in_progress");
    } finally {
      await t.cleanup();
    }
  });

  it("sweep fails a recording pending for 11 minutes after end, leaves a 2-minute-old one", async () => {
    const t = await makeTestClinic(db, "cc-sweep2");
    try {
      const now = new Date();
      const mk = async (minsAgo: number) => {
        const c = await createCall(db, { clinicId: t.clinic.id, channel: "phone" });
        await finishCall(db, {
          callId: c.id,
          clinicId: t.clinic.id,
          status: "completed",
          durationS: 5,
        });
        await setCallRecording(db, { clinicId: t.clinic.id, callId: c.id, status: "pending" });
        await db
          .update(schema.calls)
          .set({ endedAt: new Date(now.getTime() - minsAgo * 60_000) })
          .where(eq(schema.calls.id, c.id));
        return c.id;
      };
      const stale = await mk(11);
      const fresh = await mk(2);
      const r = await sweepStaleCalls(db, { now });
      expect(r.recordingsFailed).toBeGreaterThanOrEqual(1);
      expect((await getCall(db, t.clinic.id, stale)).call.recordingStatus).toBe("failed");
      expect((await getCall(db, t.clinic.id, fresh)).call.recordingStatus).toBe("pending");
    } finally {
      await t.cleanup();
    }
  });
  it("updateCallAnalysis never lets the worker invent a booking, reschedule or cancellation", async () => {
    for (const bad of ["booked", "rescheduled", "cancelled"] as const) {
      const id = await finished(a.clinic.id, "info");
      const r = await updateCallAnalysis(db, {
        clinicId: a.clinic.id,
        callId: id,
        summary: "s",
        sentiment: "neutral",
        analysis: analysis(),
        outcome: bad,
        model: "m",
      });
      expect(r.applied).toBe(true);
      expect((await getCall(db, a.clinic.id, id)).call).toMatchObject({
        outcome: "info",
        outcomeSource: "gateway",
        summary: "s",
      });
    }
  });

  it("getCallTranscript offsets are never negative, monotonic in seq, and honour recorderT0Ms", async () => {
    const c = await createCall(db, { clinicId: a.clinic.id, channel: "browser" });
    const t0 = c.startedAt.getTime();
    const at = (ms: number) => new Date(t0 + ms);
    // Stamped out of order on purpose (an assistant row persisted after a later tool row).
    const stamps = [500, 4000, 3000, 6000];
    for (const [i, ms] of stamps.entries()) {
      await appendTurn(db, {
        callId: c.id,
        clinicId: a.clinic.id,
        seq: i,
        role: i === 1 ? "tool" : "user",
        text: i === 1 ? "" : "x",
        startedAt: at(ms),
      });
    }
    await finishCall(db, {
      callId: c.id,
      clinicId: a.clinic.id,
      status: "completed",
      durationS: 7,
      metrics: { userTurns: 3 },
      recorderStartedAt: at(1000),
    });
    const t = await getCallTranscript(db, a.clinic.id, c.id);
    const offs = t.turns.map((x) => x.offsetMs);
    // The DB keeps microseconds, JS only milliseconds: allow 1 ms of rounding.
    [0, 3000, 3000, 5000].forEach((want, i) =>
      expect(Math.abs(offs[i]! - want)).toBeLessThanOrEqual(1),
    );
    expect(offs.every((o, i) => o >= 0 && (i === 0 || o >= offs[i - 1]!))).toBe(true);
    const { call } = await getCall(db, a.clinic.id, c.id);
    expect(call.metrics).toMatchObject({ userTurns: 3 });
    expect(Math.abs(call.metrics["recorderT0Ms"]! - 1000)).toBeLessThanOrEqual(1);
  });

  it("sweep caps the recorded duration at the maximum call length", async () => {
    const t = await makeTestClinic(db, "cc-sweep3");
    try {
      const now = new Date();
      const c = await createCall(db, { clinicId: t.clinic.id, channel: "phone" });
      await db
        .update(schema.calls)
        .set({ startedAt: new Date(now.getTime() - 5 * 3600_000) })
        .where(eq(schema.calls.id, c.id));
      await appendTurn(db, {
        callId: c.id,
        clinicId: t.clinic.id,
        seq: 0,
        role: "user",
        text: "x",
        startedAt: new Date(now.getTime() - 2 * 3600_000),
      });
      await sweepStaleCalls(db, { now });
      expect((await getCall(db, t.clinic.id, c.id)).call.durationS).toBe(1200);
    } finally {
      await t.cleanup();
    }
  });

  const ledgerFor = async (clinicId: string, tz: string, at: Date) => {
    const [row] = await db
      .select()
      .from(schema.usageLedger)
      .where(
        and(
          eq(schema.usageLedger.clinicId, clinicId),
          eq(schema.usageLedger.month, usageMonth(tz, at)),
        ),
      );
    return row;
  };

  it("sweep bills the time up to the last turn, not the maximum", async () => {
    const t = await makeTestClinic(db, "cc-sweep-usage");
    try {
      const now = new Date();
      const startedAt = new Date(now.getTime() - 40 * 60_000);
      const c = await createCall(db, { clinicId: t.clinic.id, channel: "phone" });
      await db.update(schema.calls).set({ startedAt }).where(eq(schema.calls.id, c.id));
      await appendTurn(db, {
        callId: c.id,
        clinicId: t.clinic.id,
        seq: 0,
        role: "user",
        text: "hi",
        startedAt: new Date(startedAt.getTime() + 10_000),
      });
      await appendTurn(db, {
        callId: c.id,
        clinicId: t.clinic.id,
        seq: 1,
        role: "assistant",
        text: "hello",
        startedAt: new Date(startedAt.getTime() + 45_000),
      });
      const r = await sweepStaleCalls(db, { now, inProgressOlderThanMin: 30 });
      expect(r.usageRecorded).toBe(1);
      expect((await getCall(db, t.clinic.id, c.id)).call.durationS).toBe(45);
      const row = await ledgerFor(t.clinic.id, t.clinic.timezone, startedAt);
      expect(row).toMatchObject({ calls: 1, callSeconds: 45 });
    } finally {
      await t.cleanup();
    }
  });

  it("sweep of a call with no turns bills 0 seconds", async () => {
    const t = await makeTestClinic(db, "cc-sweep-noturn");
    try {
      const now = new Date();
      const startedAt = new Date(now.getTime() - 40 * 60_000);
      const c = await createCall(db, { clinicId: t.clinic.id, channel: "phone" });
      await db.update(schema.calls).set({ startedAt }).where(eq(schema.calls.id, c.id));
      await sweepStaleCalls(db, { now, inProgressOlderThanMin: 30 });
      const row = await ledgerFor(t.clinic.id, t.clinic.timezone, startedAt);
      expect(row).toMatchObject({ calls: 1, callSeconds: 0 });
    } finally {
      await t.cleanup();
    }
  });

  it("sweep does not re-bill a call whose usage was already recorded", async () => {
    const t = await makeTestClinic(db, "cc-sweep-once");
    try {
      const now = new Date();
      const startedAt = new Date(now.getTime() - 40 * 60_000);
      const c = await createCall(db, { clinicId: t.clinic.id, channel: "phone" });
      await db.update(schema.calls).set({ startedAt }).where(eq(schema.calls.id, c.id));
      const month = usageMonth(t.clinic.timezone, startedAt);
      const first = await recordCallUsage(db, {
        callId: c.id,
        clinicId: t.clinic.id,
        month,
        callSeconds: 60,
      });
      expect(first.recorded).toBe(true);
      const r = await sweepStaleCalls(db, { now, inProgressOlderThanMin: 30 });
      expect(r.abandoned).toBeGreaterThanOrEqual(1);
      expect(r.usageRecorded).toBe(0);
      expect((await getCall(db, t.clinic.id, c.id)).call.status).toBe("abandoned");
      const row = await ledgerFor(t.clinic.id, t.clinic.timezone, startedAt);
      expect(row).toMatchObject({ calls: 1, callSeconds: 60 });
    } finally {
      await t.cleanup();
    }
  });

  it("purgeExpiredCalls wipes calls older than 90 days and leaves recent ones", async () => {
    const t = await makeTestClinic(db, "cc-purge");
    try {
      const now = new Date();
      const mk = async (daysAgo: number) => {
        const c = await createCall(db, { clinicId: t.clinic.id, channel: "browser" });
        await appendTurn(db, {
          callId: c.id,
          clinicId: t.clinic.id,
          seq: 0,
          role: "tool",
          text: "private words",
          toolName: "request_callback",
          toolArgs: { phone: "9876543210" },
          toolResult: { ok: true },
        });
        await finishCall(db, {
          callId: c.id,
          clinicId: t.clinic.id,
          status: "completed",
          durationS: 5,
          metrics: { userTurns: 1 },
        });
        await updateCallAnalysis(db, {
          clinicId: t.clinic.id,
          callId: c.id,
          summary: "a summary",
          sentiment: "neutral",
          analysis: analysis(),
          model: "m",
        });
        await setCallRecording(db, {
          clinicId: t.clinic.id,
          callId: c.id,
          status: "ready",
          recordingS3Key: "k/rec.wav",
          transcriptS3Key: "k/t.json",
        });
        await db
          .update(schema.calls)
          .set({ endedAt: new Date(now.getTime() - daysAgo * 86_400_000) })
          .where(eq(schema.calls.id, c.id));
        return c.id;
      };
      const old = await mk(91);
      const recent = await mk(10);
      const r = await purgeExpiredCalls(db, { now });
      expect(r.purged).toBeGreaterThanOrEqual(1);
      const o = await getCall(db, t.clinic.id, old);
      expect(o.call).toMatchObject({
        summary: null,
        recordingS3Key: null,
        transcriptS3Key: null,
        recordingStatus: "none",
      });
      expect(o.call.analysis).toMatchObject({ model: "m", purged: true });
      expect(o.call.metrics["purgedAt"]).toBe(now.getTime());
      expect(o.call.metrics["userTurns"]).toBe(1);
      expect(o.turns[0]).toMatchObject({ text: null, toolArgs: null, toolResult: null });
      const n = await getCall(db, t.clinic.id, recent);
      expect(n.call.summary).toBe("a summary");
      expect(n.call.recordingStatus).toBe("ready");
      expect(n.turns[0]!.text).toBe("private words");
      // Idempotent: a second run does not touch it again.
      const again = await purgeExpiredCalls(db, { now: new Date(now.getTime() + 1000) });
      expect((await getCall(db, t.clinic.id, old)).call.metrics["purgedAt"]).toBe(now.getTime());
      expect(again.purged).toBe(0);
    } finally {
      await t.cleanup();
    }
  });

  it("revealCallbackPhone audits and refuses after the 90-day purge", async () => {
    const cb = await createCallback(db, {
      clinicId: a.clinic.id,
      phone: "+919876500001",
      reason: "call back",
    });
    const r = await revealCallbackPhone(db, {
      clinicId: a.clinic.id,
      callbackId: cb.id,
      actorUserId: a.user.id,
    });
    expect(r.phone).toBe("+919876500001");
    const audits = await db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, cb.id));
    expect(audits).toHaveLength(1);
    expect(audits[0]?.action).toBe("callback.phone.reveal");
    expect(JSON.stringify(audits[0]?.data ?? {})).not.toContain("0001");
    await expect(
      revealCallbackPhone(db, { clinicId: b.clinic.id, callbackId: cb.id, actorUserId: b.user.id }),
    ).rejects.toMatchObject({ code: "not_found" });
    await updateCallback(db, { clinicId: a.clinic.id, callbackId: cb.id, status: "done" });
    await db
      .update(schema.callbacks)
      .set({ doneAt: new Date(Date.now() - 100 * 86_400_000) })
      .where(eq(schema.callbacks.id, cb.id));
    // open callbacks are never purged, however old
    const open = await createCallback(db, {
      clinicId: a.clinic.id,
      phone: "+919876500002",
      reason: "x",
    });
    await db
      .update(schema.callbacks)
      .set({ createdAt: new Date(Date.now() - 100 * 86_400_000) })
      .where(eq(schema.callbacks.id, open.id));
    expect((await purgeExpiredCallbacks(db, { retentionDays: 90 })).purged).toBeGreaterThanOrEqual(
      1,
    );
    const [row] = await db.select().from(schema.callbacks).where(eq(schema.callbacks.id, cb.id));
    expect(row?.phone).toBe("+91 •••• ••0001");
    expect(row?.purgedAt).not.toBeNull();
    expect(row?.reason).toBe("purged");
    await expect(
      revealCallbackPhone(db, { clinicId: a.clinic.id, callbackId: cb.id, actorUserId: a.user.id }),
    ).rejects.toMatchObject({ code: "conflict" });
    const [o] = await db.select().from(schema.callbacks).where(eq(schema.callbacks.id, open.id));
    expect(o?.purgedAt).toBeNull();
  });

  it("finishCall links the patient when given", async () => {
    const p = await createPatient(db, a.clinic.id, { phone: "+919876500003" });
    const call = await createCall(db, { clinicId: a.clinic.id, channel: "browser" });
    await finishCall(db, {
      callId: call.id,
      clinicId: a.clinic.id,
      status: "completed",
      durationS: 10,
      patientId: p.id,
    });
    const { call: got } = await getCall(db, a.clinic.id, call.id);
    expect(got.patientId).toBe(p.id);
  });

  it("finishCall refuses a patient from another clinic", async () => {
    const other = await createPatient(db, b.clinic.id, { phone: "+919876500004" });
    const call = await createCall(db, { clinicId: a.clinic.id, channel: "browser" });
    await expect(
      finishCall(db, {
        callId: call.id,
        clinicId: a.clinic.id,
        status: "completed",
        durationS: 10,
        patientId: other.id,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    const { call: got } = await getCall(db, a.clinic.id, call.id);
    expect(got.patientId).toBeNull();
  });
});
