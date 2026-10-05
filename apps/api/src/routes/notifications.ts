import { Hono } from "hono";
import { listNotifications, retryNotification } from "@muxaris/core";
import type { Db } from "@muxaris/db";
import { notificationsQuery, type ChannelFlags } from "@muxaris/shared";
import type { AppEnv } from "../deps.js";
import { requireClinic } from "../auth/middleware.js";
import { v } from "../validate.js";

export function notificationRoutes(db: Db, channels: ChannelFlags) {
  const r = new Hono<AppEnv>();
  const member = requireClinic(db);

  r.get("/notifications", member, v("query", notificationsQuery), async (c) => {
    const { status, appointmentId, patientId, limit, offset } = c.req.valid("query");
    return c.json(
      await listNotifications(db, c.get("clinic").id, {
        ...(status ? { status } : {}),
        ...(appointmentId ? { appointmentId } : {}),
        ...(patientId ? { patientId } : {}),
        limit,
        offset,
      }),
    );
  });

  r.post("/notifications/:id/retry", member, async (c) => {
    const notification = await retryNotification(db, {
      clinicId: c.get("clinic").id,
      notificationId: c.req.param("id"),
      channels,
    });
    return c.json({ notification });
  });
  return r;
}
