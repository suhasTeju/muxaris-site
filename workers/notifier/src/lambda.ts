import { createDb } from "@muxaris/db";
import { enqueueDueReminders } from "@muxaris/core";
import { deliverOnce, type DeliverDeps } from "./deliver.js";
import { loadEnv, type NotifierEnv } from "./env.js";
import { jsonLog } from "./log.js";
import { buildProviders } from "./providers/select.js";

let cached: { env: NotifierEnv; deps: DeliverDeps } | null = null;
function get() {
  if (!cached) {
    const env = loadEnv();
    const { db } = createDb(env.databaseUrl);
    cached = { env, deps: { db, providers: buildProviders(env, jsonLog), log: jsonLog } };
  }
  return cached;
}

/** EventBridge rate(1 minute) in Phase 5: drains up to 50 queued rows per run. */
export const deliverHandler = async () => deliverOnce(get().deps, 50);

/** EventBridge rate(15 minutes) in Phase 5: queues 24 h and 2 h reminders. */
export const remindersHandler = async () => {
  const { env, deps } = get();
  return enqueueDueReminders(deps.db, { channels: env.channels });
};
