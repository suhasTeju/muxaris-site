import { and, asc, desc, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import { schema, newId, type Db } from "@muxaris/db";
import { maskPhone } from "@muxaris/shared";
import { CoreError } from "./errors.js";

const { calls, callTurns, callbacks, patients, auditLog } = schema;

type CallOutcome = (typeof schema.callOutcomeEnum.enumValues)[number];
type CallStatus = (typeof schema.callStatusEnum.enumValues)[number];
type CallChannel = (typeof schema.callChannelEnum.enumValues)[number];
export type CallRow = typeof calls.$inferSelect;
export type TurnRow = typeof callTurns.$inferSelect;
export type CallbackRow = typeof callbacks.$inferSelect;

async function assertCall(db: Db, clinicId: string, callId: string) {
  const [row] = await db
    .select({ id: calls.id })
    .from(calls)
    .where(and(eq(calls.id, callId), eq(calls.clinicId, clinicId)));
  if (!row) throw new CoreError("not_found", "call not found");
}

export async function createCall(
  db: Db,
  input: {
    clinicId: string;
    channel: "browser" | "phone";
    startedByUserId?: string;
    callerPhone?: string;
  },
) {
  const [row] = await db
    .insert(calls)
    .values({
      id: newId("call"),
      clinicId: input.clinicId,
      channel: input.channel,
      startedByUserId: input.startedByUserId ?? null,
      callerPhone: input.callerPhone ?? null,
    })
    .returning();
  return row!;
}

export async function appendTurn(
  db: Db,
  input: {
    callId: string;
    clinicId: string;
    seq: number;
    role: "user" | "assistant" | "tool";
    text?: string;
    toolName?: string;
    toolArgs?: unknown;
    toolResult?: unknown;
    latencyMs?: number;
  },
) {
  await assertCall(db, input.clinicId, input.callId);
  const [row] = await db
    .insert(callTurns)
    .values({
      id: newId("turn"),
      clinicId: input.clinicId,
      callId: input.callId,
      seq: input.seq,
      role: input.role,
      text: input.text ?? null,
      toolName: input.toolName ?? null,
      toolArgs: input.toolArgs ?? null,
      toolResult: input.toolResult ?? null,
      latencyMs: input.latencyMs ?? null,
    })
    .onConflictDoNothing({ target: [callTurns.callId, callTurns.seq] })
    .returning();
  if (!row) throw new CoreError("conflict", `turn seq ${input.seq} already exists for call`);
  return row;
}

/** NOTE: clinicId is required (tenant scoping), unlike the bare brief signature. */
export async function finishCall(
  db: Db,
  input: {
    callId: string;
    clinicId: string;
    status: "completed" | "failed";
    outcome?: CallOutcome;
    durationS: number;
    languageDetected?: string;
    metrics?: Record<string, number>;
  },
) {
  const [row] = await db
    .update(calls)
    .set({
      status: input.status,
      outcome: input.outcome ?? null,
      ...(input.outcome ? { outcomeSource: "gateway" } : {}),
      durationS: input.durationS,
      endedAt: new Date(),
      ...(input.languageDetected ? { languageDetected: input.languageDetected } : {}),
      ...(input.metrics ? { metrics: input.metrics } : {}),
    })
    .where(
      and(
        eq(calls.id, input.callId),
        eq(calls.clinicId, input.clinicId),
        eq(calls.status, "in_progress"),
      ),
    )
    .returning();
  if (row) return row;
  // Already finished (e.g. shutdown and close handler both finishing): keep the first result.
  const [existing] = await db
    .select()
    .from(calls)
    .where(and(eq(calls.id, input.callId), eq(calls.clinicId, input.clinicId)));
  if (!existing) throw new CoreError("not_found", "call not found");
  return existing;
}

export async function createCallback(
  db: Db,
  input: {
    clinicId: string;
    callId?: string;
    patientId?: string;
    phone: string;
    reason: string;
    priority?: string;
  },
) {
  if (input.callId) await assertCall(db, input.clinicId, input.callId);
  if (input.patientId) {
    const [p] = await db
      .select({ id: patients.id })
      .from(patients)
      .where(and(eq(patients.id, input.patientId), eq(patients.clinicId, input.clinicId)));
    if (!p) throw new CoreError("not_found", "patient not found");
  }
  const [row] = await db
    .insert(callbacks)
    .values({
      id: newId("cb"),
      clinicId: input.clinicId,
      callId: input.callId ?? null,
      patientId: input.patientId ?? null,
      phone: input.phone,
      reason: input.reason,
      ...(input.priority ? { priority: input.priority } : {}),
    })
    .returning();
  return row!;
}

export type CallFilters = {
  from?: Date;
  to?: Date;
  outcome?: CallOutcome;
  status?: CallStatus;
  channel?: CallChannel;
  limit: number;
  offset: number;
};

export async function listCalls(
  db: Db,
  clinicId: string,
  f: CallFilters,
): Promise<{ calls: CallRow[]; total: number }> {
  const where = and(
    eq(calls.clinicId, clinicId),
    f.from ? gte(calls.startedAt, f.from) : undefined,
    f.to ? lt(calls.startedAt, f.to) : undefined,
    f.outcome ? eq(calls.outcome, f.outcome) : undefined,
    f.status ? eq(calls.status, f.status) : undefined,
    f.channel ? eq(calls.channel, f.channel) : undefined,
  );
  const rows = await db
    .select()
    .from(calls)
    .where(where)
    .orderBy(desc(calls.startedAt), desc(calls.id))
    .limit(f.limit)
    .offset(f.offset);
  const [t] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(calls)
    .where(where);
  return { calls: rows, total: t?.n ?? 0 };
}

async function loadCall(db: Db, clinicId: string, callId: string): Promise<CallRow> {
  const [row] = await db
    .select()
    .from(calls)
    .where(and(eq(calls.id, callId), eq(calls.clinicId, clinicId)));
  if (!row) throw new CoreError("not_found", "call not found");
  return row;
}

/** Callback as exposed by core reads: the raw phone never leaves this module. */
export type CallbackView = Omit<CallbackRow, "phone"> & { phoneMasked: string };
export function toCallbackView(row: CallbackRow): CallbackView {
  const { phone, ...rest } = row;
  return { ...rest, phoneMasked: maskPhone(phone) };
}

export async function getCall(db: Db, clinicId: string, callId: string) {
  const call = await loadCall(db, clinicId, callId);
  const turns = await db
    .select()
    .from(callTurns)
    .where(and(eq(callTurns.callId, callId), eq(callTurns.clinicId, clinicId)))
    .orderBy(asc(callTurns.seq));
  const cbs = await db
    .select()
    .from(callbacks)
    .where(and(eq(callbacks.callId, callId), eq(callbacks.clinicId, clinicId)))
    .orderBy(asc(callbacks.createdAt));
  return { call, turns, callbacks: cbs.map(toCallbackView) };
}

export async function setCallRecording(
  db: Db,
  input: {
    clinicId: string;
    callId: string;
    status: "pending" | "ready" | "failed" | "none";
    recordingS3Key?: string;
    transcriptS3Key?: string;
  },
): Promise<void> {
  const rows = await db
    .update(calls)
    .set({
      recordingStatus: input.status,
      ...(input.recordingS3Key ? { recordingS3Key: input.recordingS3Key } : {}),
      ...(input.transcriptS3Key ? { transcriptS3Key: input.transcriptS3Key } : {}),
    })
    .where(and(eq(calls.id, input.callId), eq(calls.clinicId, input.clinicId)))
    .returning({ id: calls.id });
  if (rows.length === 0) throw new CoreError("not_found", "call not found");
}

/**
 * Writes the post-call analysis. The outcome is refined only when it is still the gateway's weak
 * guess (null/info/unknown/abandoned) and never when staff edited it.
 */
export async function updateCallAnalysis(
  db: Db,
  input: {
    clinicId: string;
    callId: string;
    summary: string;
    sentiment: "positive" | "neutral" | "negative";
    analysis: NonNullable<CallRow["analysis"]>;
    outcome?: CallOutcome;
    model: string;
  },
): Promise<{ applied: boolean }> {
  const refinable = sql`(outcome_source IS NULL OR outcome_source = 'gateway') AND (outcome IS NULL OR outcome IN ('info','unknown','abandoned'))`;
  const rows = await db
    .update(calls)
    .set({
      summary: input.summary,
      sentiment: input.sentiment,
      analysis: { ...input.analysis, model: input.model },
      analysedAt: new Date(),
      ...(input.outcome
        ? {
            outcome: sql`CASE WHEN ${refinable} THEN ${input.outcome}::call_outcome ELSE outcome END`,
            outcomeSource: sql`CASE WHEN ${refinable} THEN 'worker' ELSE outcome_source END`,
          }
        : {}),
    })
    .where(and(eq(calls.id, input.callId), eq(calls.clinicId, input.clinicId)))
    .returning({ id: calls.id });
  return { applied: rows.length > 0 };
}

export async function setCallOutcomeByStaff(
  db: Db,
  input: { clinicId: string; callId: string; outcome: CallOutcome; actorUserId: string },
): Promise<CallRow> {
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select({ outcome: calls.outcome })
      .from(calls)
      .where(and(eq(calls.id, input.callId), eq(calls.clinicId, input.clinicId)))
      .for("update");
    if (!before) throw new CoreError("not_found", "call not found");
    const [row] = await tx
      .update(calls)
      .set({ outcome: input.outcome, outcomeSource: "staff" })
      .where(and(eq(calls.id, input.callId), eq(calls.clinicId, input.clinicId)))
      .returning();
    await tx.insert(auditLog).values({
      id: newId("aud"),
      clinicId: input.clinicId,
      actorId: input.actorUserId,
      action: "call.outcome.edit",
      entity: "call",
      entityId: input.callId,
      data: { from: before.outcome, to: input.outcome },
    });
    return row!;
  });
}

export type TranscriptJson = {
  callId: string;
  clinicId: string;
  startedAt: Date;
  endedAt: Date | null;
  language: string | null;
  turns: Array<{
    seq: number;
    role: "user" | "assistant" | "tool";
    text?: string;
    toolName?: string;
    offsetMs: number;
  }>;
};

export async function getCallTranscript(
  db: Db,
  clinicId: string,
  callId: string,
): Promise<TranscriptJson> {
  const { call, turns } = await getCall(db, clinicId, callId);
  return {
    callId: call.id,
    clinicId: call.clinicId,
    startedAt: call.startedAt,
    endedAt: call.endedAt,
    language: call.languageDetected,
    turns: turns.map((t) => ({
      seq: t.seq,
      role: t.role,
      ...(t.text ? { text: t.text } : {}),
      ...(t.toolName ? { toolName: t.toolName } : {}),
      offsetMs: t.startedAt.getTime() - call.startedAt.getTime(),
    })),
  };
}

export async function listCallbacks(
  db: Db,
  clinicId: string,
  f: { status: "open" | "done" | "all"; callId?: string; limit: number; offset: number },
): Promise<{
  callbacks: CallbackView[];
  total: number;
}> {
  const where = and(
    eq(callbacks.clinicId, clinicId),
    f.status === "all" ? undefined : eq(callbacks.status, f.status),
    f.callId ? eq(callbacks.callId, f.callId) : undefined,
  );
  const rows = await db
    .select()
    .from(callbacks)
    .where(where)
    .orderBy(desc(callbacks.createdAt), desc(callbacks.id))
    .limit(f.limit)
    .offset(f.offset);
  const [t] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(callbacks)
    .where(where);
  return {
    callbacks: rows.map(toCallbackView),
    total: t?.n ?? 0,
  };
}

export async function updateCallback(
  db: Db,
  input: {
    clinicId: string;
    callbackId: string;
    status?: "open" | "done";
    assignedTo?: string | null;
    note?: string;
  },
): Promise<CallbackView> {
  const [row] = await db
    .update(callbacks)
    .set({
      ...(input.status
        ? { status: input.status, doneAt: input.status === "done" ? new Date() : null }
        : {}),
      ...(input.assignedTo !== undefined ? { assignedTo: input.assignedTo } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
    })
    .where(and(eq(callbacks.id, input.callbackId), eq(callbacks.clinicId, input.clinicId)))
    .returning();
  if (!row) throw new CoreError("not_found", "callback not found");
  return toCallbackView(row);
}

export async function getOverviewStats(
  db: Db,
  clinicId: string,
  w: { dayStart: Date; dayEnd: Date },
): Promise<{
  callsToday: number;
  bookedToday: number;
  openCallbacks: number;
  avgDurationS: number | null;
  byOutcome: Record<string, number>;
}> {
  const inWindow: SQL | undefined = and(
    eq(calls.clinicId, clinicId),
    gte(calls.startedAt, w.dayStart),
    lt(calls.startedAt, w.dayEnd),
  );
  const [agg] = await db
    .select({
      n: sql<number>`count(*)::int`,
      avg: sql<string | null>`avg(${calls.durationS}) FILTER (WHERE ${calls.endedAt} IS NOT NULL)`,
    })
    .from(calls)
    .where(inWindow);
  const outcomes = await db
    .select({ outcome: calls.outcome, n: sql<number>`count(*)::int` })
    .from(calls)
    .where(and(inWindow, sql`${calls.outcome} IS NOT NULL`))
    .groupBy(calls.outcome);
  const [cb] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(callbacks)
    .where(and(eq(callbacks.clinicId, clinicId), eq(callbacks.status, "open")));
  const byOutcome: Record<string, number> = {};
  for (const o of outcomes) if (o.outcome) byOutcome[o.outcome] = o.n;
  return {
    callsToday: agg?.n ?? 0,
    bookedToday: byOutcome["booked"] ?? 0,
    openCallbacks: cb?.n ?? 0,
    avgDurationS: agg?.avg == null ? null : Math.round(Number(agg.avg)),
    byOutcome,
  };
}

/** Maintenance sweep run by the worker; deliberately not clinic-scoped. */
export async function sweepStaleCalls(
  db: Db,
  opts: {
    now?: Date;
    inProgressOlderThanMin?: number;
    recordingPendingOlderThanMin?: number;
  } = {},
): Promise<{ abandoned: number; recordingsFailed: number }> {
  const now = opts.now ?? new Date();
  const cutoff = (min: number) => new Date(now.getTime() - min * 60_000);
  const abandoned = await db
    .update(calls)
    .set({
      status: "abandoned",
      outcome: sql`COALESCE(${calls.outcome}, 'abandoned'::call_outcome)`,
      outcomeSource: sql`COALESCE(${calls.outcomeSource}, 'gateway')`,
      endedAt: sql`COALESCE(${calls.endedAt}, ${now.toISOString()}::timestamptz)`,
      durationS: sql`COALESCE(${calls.durationS}, EXTRACT(EPOCH FROM (${now.toISOString()}::timestamptz - ${calls.startedAt}))::int)`,
    })
    .where(
      and(
        eq(calls.status, "in_progress"),
        lt(calls.startedAt, cutoff(opts.inProgressOlderThanMin ?? 30)),
      ),
    )
    .returning({ id: calls.id });
  const failed = await db
    .update(calls)
    .set({ recordingStatus: "failed" })
    .where(
      and(
        eq(calls.recordingStatus, "pending"),
        sql`${calls.endedAt} IS NOT NULL`,
        lt(calls.endedAt, cutoff(opts.recordingPendingOlderThanMin ?? 10)),
      ),
    )
    .returning({ id: calls.id });
  return { abandoned: abandoned.length, recordingsFailed: failed.length };
}
