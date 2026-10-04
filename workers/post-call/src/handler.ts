import { and, eq } from "drizzle-orm";
import { schema, type Db } from "@muxaris/db";
import {
  createCallback,
  getCall,
  listCallbacks,
  markCallAnalysed,
  updateCallAnalysis,
} from "@muxaris/core";
import type { PostCallMessage } from "@muxaris/shared";
import type { JobQueue } from "@muxaris/storage";
import type { Analyser } from "./analyse.js";
import type { LogFn } from "./log.js";

export interface HandlerDeps {
  db: Db;
  analyser: Analyser;
  log: LogFn;
  /** Recorded in calls.analysis.model. */
  modelId?: string;
  now?: () => Date;
}

export type ProcessResult = "analysed" | "skipped_no_turns" | "skipped_already" | "failed";

const REANALYSE_AFTER_MS = 24 * 3600_000;

export async function processMessage(
  deps: HandlerDeps,
  msg: PostCallMessage,
): Promise<ProcessResult> {
  const { db, analyser, log } = deps;
  const now = (deps.now ?? (() => new Date()))();
  const modelId = deps.modelId ?? "unknown";
  const started = Date.now();
  try {
    const { call, turns } = await getCall(db, msg.clinicId, msg.callId);
    if (call.analysedAt && now.getTime() - call.analysedAt.getTime() < REANALYSE_AFTER_MS) {
      log("info", "post-call skipped", { callId: msg.callId, result: "skipped_already" });
      return "skipped_already";
    }
    if (!turns.some((t) => t.role === "user")) {
      // Mark analysed so the call is not picked up again.
      await markCallAnalysed(db, {
        clinicId: msg.clinicId,
        callId: msg.callId,
        reason: "no_turns",
        model: "none",
      });
      log("info", "post-call skipped", { callId: msg.callId, result: "skipped_no_turns" });
      return "skipped_no_turns";
    }

    const analysis = await analyser.analyse({
      turns: turns.map((t) => ({
        role: t.role,
        ...(t.text ? { text: t.text } : {}),
        ...(t.toolName ? { toolName: t.toolName } : {}),
      })),
      language: call.languageDetected ?? "unknown",
      gatewayOutcome: call.outcome ?? null,
    });

    let callbackCreated = false;
    if (analysis.needsCallback) {
      let phone = call.callerPhone ?? null;
      if (!phone && call.patientId) {
        const [p] = await db
          .select({ phone: schema.patients.phone })
          .from(schema.patients)
          .where(
            and(eq(schema.patients.id, call.patientId), eq(schema.patients.clinicId, msg.clinicId)),
          );
        phone = p?.phone ?? null;
      }
      if (phone) {
        const existing = await listCallbacks(db, msg.clinicId, {
          status: "all",
          callId: msg.callId,
          limit: 1,
          offset: 0,
        });
        if (existing.total === 0) {
          await createCallback(db, {
            clinicId: msg.clinicId,
            callId: msg.callId,
            ...(call.patientId ? { patientId: call.patientId } : {}),
            phone,
            reason: analysis.callbackReason ?? "Follow-up requested",
            priority: "normal",
          });
          callbackCreated = true;
        }
      }
    }
    // Analysis (and analysedAt) is written last so a failure above is retried, not skipped.
    await updateCallAnalysis(db, {
      clinicId: msg.clinicId,
      callId: msg.callId,
      summary: analysis.summary,
      sentiment: analysis.sentiment,
      analysis: {
        entities: analysis.entities,
        needsCallback: analysis.needsCallback,
        model: modelId,
        ...(analysis.callbackReason ? { callbackReason: analysis.callbackReason } : {}),
      },
      outcome: analysis.outcome,
      model: modelId,
    });

    log("info", "post-call analysed", {
      callId: msg.callId,
      outcome: analysis.outcome,
      callbackCreated,
      ms: Date.now() - started,
    });
    return "analysed";
  } catch (e) {
    log("error", "post-call failed", {
      callId: msg.callId,
      err: e instanceof Error ? e.name : "unknown",
    });
    return "failed";
  }
}

/** One long-poll round; returns the number of messages received. */
export async function runOnce(
  deps: HandlerDeps,
  queue: JobQueue<PostCallMessage>,
  waitSeconds = 20,
): Promise<number> {
  const msgs = await queue.receive({ max: 5, waitSeconds });
  for (const m of msgs) {
    const r = await processMessage(deps, m.body);
    if (r !== "failed") await queue.delete(m.handle);
  }
  return msgs.length;
}
