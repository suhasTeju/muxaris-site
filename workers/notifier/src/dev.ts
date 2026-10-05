import { createDb } from "@muxaris/db";
import { enqueueDueReminders } from "@muxaris/core";
import { deliverOnce } from "./deliver.js";
import { loadEnv } from "./env.js";
import { jsonLog as log } from "./log.js";
import { buildProviders } from "./providers/select.js";

const env = loadEnv();
const { db, pool } = createDb(env.databaseUrl);
const deps = { db, providers: buildProviders(env, log), log };
let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => (stopping = true));
log("info", "notifier started", {
  providerMode: env.providerMode,
  sms: env.channels.sms,
  whatsapp: env.channels.whatsapp,
});

let lastReminders = 0;
while (!stopping) {
  try {
    if (Date.now() - lastReminders >= 60_000) {
      lastReminders = Date.now();
      const r = await enqueueDueReminders(db, { channels: env.channels });
      if (r.queued24h || r.queued2h) log("info", "reminders queued", r);
    }
    const d = await deliverOnce(deps, 20);
    if (d.sent || d.failed || d.retried || d.skipped) log("info", "delivery pass", d);
  } catch (e) {
    log("error", "notifier pass failed", { err: e instanceof Error ? e.name : "unknown" });
  }
  await new Promise((r) => setTimeout(r, 10_000));
}
await pool.end();
log("info", "notifier stopped");
