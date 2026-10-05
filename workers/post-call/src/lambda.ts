import { applySecretsToEnv, createDb } from "@muxaris/db";
import { purgeExpiredCallbacks, purgeExpiredCalls, sweepStaleCalls } from "@muxaris/core";
import { postCallMessageSchema } from "@muxaris/shared";
import { createNovaAnalyser } from "./analyse.js";
import { loadEnv } from "./env.js";
import { processMessage, type HandlerDeps } from "./handler.js";
import { jsonLog } from "./log.js";

let deps: Promise<HandlerDeps> | null = null;
async function getDeps(): Promise<HandlerDeps> {
  deps ??= (async () => {
    await applySecretsToEnv();
    const env = loadEnv();
    const { db } = createDb(env.databaseUrl);
    return {
      db,
      analyser: createNovaAnalyser({ modelId: env.modelId, region: env.awsRegion }),
      log: jsonLog,
      modelId: env.modelId,
    };
  })();
  try {
    return await deps;
  } catch (e) {
    deps = null; // allow a retry on the next invocation
    throw e;
  }
}

export const handler = async (event: {
  Records: Array<{ body: string; messageId: string }>;
}): Promise<{ batchItemFailures: Array<{ itemIdentifier: string }> }> => {
  const d = await getDeps();
  const batchItemFailures: Array<{ itemIdentifier: string }> = [];
  for (const rec of event.Records) {
    let parsed;
    try {
      parsed = postCallMessageSchema.parse(JSON.parse(rec.body));
    } catch {
      // Malformed messages can never succeed; drop them instead of cycling to the DLQ.
      d.log("warn", "post-call message invalid", { messageId: rec.messageId });
      continue;
    }
    if ((await processMessage(d, parsed)) === "failed")
      batchItemFailures.push({ itemIdentifier: rec.messageId });
  }
  return { batchItemFailures };
};

/** For a Phase 5 EventBridge schedule: stale-call sweep plus the 90-day retention purge. */
export const sweepHandler = async () => {
  const { db } = await getDeps();
  const swept = await sweepStaleCalls(db);
  const { purged } = await purgeExpiredCalls(db);
  const { purged: callbacksPurged } = await purgeExpiredCallbacks(db);
  return { ...swept, purged, callbacksPurged };
};
