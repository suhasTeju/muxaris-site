import { createDb } from "@muxaris/db";
import { purgeExpiredCalls, sweepStaleCalls } from "@muxaris/core";
import { createSqsQueue } from "@muxaris/storage";
import { postCallMessageSchema, type PostCallMessage } from "@muxaris/shared";
import { createNovaAnalyser } from "./analyse.js";
import { loadEnv } from "./env.js";
import { runOnce } from "./handler.js";
import { jsonLog as log } from "./log.js";

const env = loadEnv();
if (!env.queueUrl) {
  console.error(
    "POST_CALL_QUEUE_URL is empty: set it in .env (MuxarisStorage output PostCallQueueUrl)",
  );
  process.exit(1);
}

const { db, pool } = createDb(env.databaseUrl);
const queue = createSqsQueue<PostCallMessage>({
  url: env.queueUrl,
  region: env.awsRegion,
  parse: (raw) => postCallMessageSchema.parse(raw),
});
const deps = {
  db,
  analyser: createNovaAnalyser({ modelId: env.modelId, region: env.awsRegion }),
  log,
  modelId: env.modelId,
};

let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => (stopping = true));

async function sweep(): Promise<void> {
  try {
    const r = await sweepStaleCalls(db);
    log("info", "sweep", { abandoned: r.abandoned, recordingsFailed: r.recordingsFailed });
  } catch (e) {
    log("error", "sweep failed", { err: e instanceof Error ? e.name : "unknown" });
  }
  try {
    const p = await purgeExpiredCalls(db);
    if (p.purged > 0) log("info", "retention purge", { purged: p.purged });
  } catch (e) {
    log("error", "purge failed", { err: e instanceof Error ? e.name : "unknown" });
  }
}

log("info", "post-call worker started", { modelId: env.modelId });
let lastSweep = 0;
while (!stopping) {
  if (Date.now() - lastSweep >= 60_000) {
    lastSweep = Date.now();
    await sweep();
  }
  try {
    await runOnce(deps, queue);
  } catch (e) {
    log("error", "poll failed", { err: e instanceof Error ? e.name : "unknown" });
    await new Promise((r) => setTimeout(r, 5000));
  }
}
await pool.end();
log("info", "post-call worker stopped");
