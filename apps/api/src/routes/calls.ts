import { Hono } from "hono";
import { getCall, listCalls, setCallOutcomeByStaff } from "@muxaris/core";
import type { Db } from "@muxaris/db";
import { callOutcomeBody, callsQuery } from "@muxaris/shared";
import type { BlobStore } from "@muxaris/storage";
import type { AppEnv } from "../deps.js";
import { requireClinic } from "../auth/middleware.js";
import { v } from "../validate.js";

const RECORDING_TTL_S = 600;

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
    return c.json(res);
  });

  r.get("/calls/:id", member, async (c) => {
    return c.json(await getCall(db, c.get("clinic").id, c.req.param("id")));
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
