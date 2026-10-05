import { Hono } from "hono";
import { getCall, listCalls, setCallOutcomeByStaff } from "@muxaris/core";
import type { Db } from "@muxaris/db";
import { callOutcomeBody, callsQuery, maskPhone } from "@muxaris/shared";
import type { BlobStore } from "@muxaris/storage";
import type { AppEnv } from "../deps.js";
import { requireClinic } from "../auth/middleware.js";
import { v } from "../validate.js";

const RECORDING_TTL_S = 600;

/** Replaces the raw caller number with a masked one; phones leave only via audited reveals. */
function toCallDto<T extends { callerPhone: string | null }>(row: T) {
  const { callerPhone, ...rest } = row;
  return { ...rest, callerPhoneMasked: callerPhone ? maskPhone(callerPhone) : null };
}

function toolStatus(result: unknown): "ok" | "error" {
  if (result && typeof result === "object") {
    const o = result as Record<string, unknown>;
    if (o["ok"] === false || "error" in o) return "error";
  }
  return "ok";
}

export function callRoutes(db: Db, deps: { blobs: BlobStore | null }) {
  const r = new Hono<AppEnv>();
  const member = requireClinic(db);

  r.get("/calls", member, v("query", callsQuery), async (c) => {
    const q = c.req.valid("query");
    const { from, to, outcome, status, channel, limit, offset } = q;
    const res = await listCalls(db, c.get("clinic").id, {
      ...(from ? { from: new Date(from) } : {}),
      ...(to ? { to: new Date(to) } : {}),
      ...(outcome ? { outcome } : {}),
      ...(status ? { status } : {}),
      ...(channel ? { channel } : {}),
      limit,
      offset,
    });
    return c.json({ ...res, calls: res.calls.map(toCallDto) });
  });

  r.get("/calls/:id", member, async (c) => {
    const { turns, call, ...rest } = await getCall(db, c.get("clinic").id, c.req.param("id"));
    // Tool arguments and results hold raw phone numbers and names; the UI only needs the status.
    return c.json({
      ...rest,
      call: toCallDto(call),
      turns: turns.map(({ toolArgs: _a, toolResult, ...turn }) => ({
        ...turn,
        ...(turn.role === "tool" ? { toolStatus: toolStatus(toolResult) } : {}),
      })),
    });
  });

  r.get("/calls/:id/recording-url", member, async (c) => {
    const { call } = await getCall(db, c.get("clinic").id, c.req.param("id"));
    if (call.recordingStatus === "pending")
      return c.json({ error: { code: "recording_pending", message: "recording not ready" } }, 409);
    if (call.recordingStatus !== "ready" || !call.recordingS3Key)
      return c.json({ error: { code: "not_found", message: "no recording" } }, 404);
    if (!deps.blobs)
      return c.json(
        { error: { code: "storage_unavailable", message: "recording storage unavailable" } },
        503,
      );
    const url = await deps.blobs.presignGet(call.recordingS3Key, RECORDING_TTL_S);
    return c.json({ url, expiresInS: RECORDING_TTL_S });
  });

  r.patch("/calls/:id", member, v("json", callOutcomeBody), async (c) => {
    const call = await setCallOutcomeByStaff(db, {
      clinicId: c.get("clinic").id,
      callId: c.req.param("id"),
      outcome: c.req.valid("json").outcome,
      actorUserId: c.get("user").id,
    });
    return c.json({ call });
  });
  return r;
}
