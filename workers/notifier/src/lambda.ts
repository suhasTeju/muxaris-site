import { applySecretsToEnv, createDb } from "@muxaris/db";
import { enqueueDueReminders } from "@muxaris/core";
import { deliverOnce, type DeliverDeps } from "./deliver.js";
import { loadEnv, type NotifierEnv } from "./env.js";
import { jsonLog } from "./log.js";
import { buildProviders } from "./providers/select.js";

type Cached = { env: NotifierEnv; deps: DeliverDeps };
let cached: Promise<Cached> | null = null;
async function get(): Promise<Cached> {
  cached ??= (async () => {
    await applySecretsToEnv();
    const env = loadEnv();
    const { db } = createDb(env.databaseUrl);
    return { env, deps: { db, providers: buildProviders(env, jsonLog), log: jsonLog } };
  })();
  try {
    return await cached;
  } catch (e) {
    cached = null; // allow a retry on the next invocation
    throw e;
  }
}

/** EventBridge rate(1 minute) in Phase 5: drains up to 50 queued rows per run. */
export const deliverHandler = async () => deliverOnce((await get()).deps, 50);

/** EventBridge rate(15 minutes) in Phase 5: queues 24 h and 2 h reminders. */
export const remindersHandler = async () => {
  const { env, deps } = await get();
  return enqueueDueReminders(deps.db, { channels: env.channels });
};
