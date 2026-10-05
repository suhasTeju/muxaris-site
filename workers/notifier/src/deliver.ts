import type { Db } from "@muxaris/db";
import {
  MAX_ATTEMPTS,
  appointmentStillDeliverable,
  claimQueuedNotifications,
  markNotificationFailed,
  markNotificationSent,
  markNotificationSkipped,
} from "@muxaris/core";
import type { LogFn } from "./log.js";
import type { Providers } from "./providers/types.js";

export interface DeliverDeps {
  db: Db;
  providers: Providers;
  log: LogFn;
  now?: () => Date;
  /** Test-only scoping to one clinic; production never sets it. */
  clinicId?: string;
}

export async function deliverOnce(deps: DeliverDeps, limit = 20) {
  const now = (deps.now ?? (() => new Date()))();
  const rows = await claimQueuedNotifications(deps.db, {
    limit,
    now,
    ...(deps.clinicId ? { clinicId: deps.clinicId } : {}),
  });
  const r = { sent: 0, retried: 0, failed: 0, skipped: 0 };
  for (const n of rows) {
    // backstop: the appointment may have been cancelled, finished or moved past since queueing
    if (
      n.appointmentId &&
      !(await appointmentStillDeliverable(deps.db, n.clinicId, n.appointmentId, n.template, now))
    ) {
      await markNotificationSkipped(deps.db, n.id, { reason: "superseded" });
      r.skipped++;
      deps.log("info", "notification skipped", {
        id: n.id,
        channel: n.channel,
        reason: "superseded",
      });
      continue;
    }
    const provider = deps.providers[n.channel];
    const payload = (n.payload ?? {}) as { subject?: string; body?: string };
    if (!provider || !n.to || !payload.body) {
      await markNotificationSkipped(deps.db, n.id, { reason: "channel_disabled" });
      r.skipped++;
      deps.log("info", "notification skipped", {
        id: n.id,
        channel: n.channel,
        reason: "channel_disabled",
      });
      continue;
    }
    try {
      const { providerId } = await provider.send({
        to: n.to,
        subject: payload.subject ?? "",
        body: payload.body,
      });
      await markNotificationSent(deps.db, n.id, { providerId, now });
      r.sent++;
      deps.log("info", "notification sent", {
        id: n.id,
        channel: n.channel,
        template: n.template,
      });
    } catch (e) {
      const name = e instanceof Error ? e.name || "Error" : "Error";
      const final = n.attempts >= MAX_ATTEMPTS;
      await markNotificationFailed(deps.db, n.id, { error: name, final });
      if (final) r.failed++;
      else r.retried++;
      deps.log("warn", "notification send failed", {
        id: n.id,
        channel: n.channel,
        attempt: n.attempts,
        final,
        err: name,
      });
    }
  }
  return r;
}
