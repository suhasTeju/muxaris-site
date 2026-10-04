import { and, eq } from "drizzle-orm";
import { schema, newId, type Db } from "@muxaris/db";
import { CoreError } from "./errors.js";

const { calls, callTurns, callbacks, patients } = schema;

type CallOutcome = (typeof schema.callOutcomeEnum.enumValues)[number];

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
      durationS: input.durationS,
      endedAt: new Date(),
      ...(input.languageDetected ? { languageDetected: input.languageDetected } : {}),
      ...(input.metrics ? { metrics: input.metrics } : {}),
    })
    .where(and(eq(calls.id, input.callId), eq(calls.clinicId, input.clinicId)))
    .returning();
  if (!row) throw new CoreError("not_found", "call not found");
  return row;
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
