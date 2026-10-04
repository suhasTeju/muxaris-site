import { Hono } from "hono";
import { z } from "zod";
import { listCallbacks, updateCallback } from "@muxaris/core";
import type { Db } from "@muxaris/db";
import { callbackPatchBody } from "@muxaris/shared";
import type { AppEnv } from "../deps.js";
import { requireClinic } from "../auth/middleware.js";
import { v } from "../validate.js";

const callbacksQuery = z.object({
  status: z.enum(["open", "done", "all"]).default("open"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export function callbackRoutes(db: Db) {
  const r = new Hono<AppEnv>();
  const member = requireClinic(db);

  r.get("/callbacks", member, v("query", callbacksQuery), async (c) => {
    return c.json(await listCallbacks(db, c.get("clinic").id, c.req.valid("query")));
  });

  r.patch("/callbacks/:id", member, v("json", callbackPatchBody), async (c) => {
    const { status, assignedTo, note } = c.req.valid("json");
    const callback = await updateCallback(db, {
      clinicId: c.get("clinic").id,
      callbackId: c.req.param("id"),
      ...(status ? { status } : {}),
      ...(assignedTo !== undefined ? { assignedTo } : {}),
      ...(note !== undefined ? { note } : {}),
    });
    return c.json({ callback });
  });
  return r;
}
