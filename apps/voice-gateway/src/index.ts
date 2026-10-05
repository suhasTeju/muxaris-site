import { applySecretsToEnv, createDb } from "@muxaris/db";
import { loadEnv } from "./env.js";
import { createServer } from "./server.js";

const POOL_END_TIMEOUT_MS = 5_000;
const HARD_EXIT_MS = 20_000;

const { applied } = await applySecretsToEnv();
if (applied.length) console.log("secrets applied", { keys: applied });

const env = loadEnv();
if (env.provider === "mock")
  console.warn("SARVAM_TTS_API_KEY not set: running with mock voice providers");
const { db, pool } = createDb(env.databaseUrl);
const server = createServer({ version: process.env.GIT_SHA || "dev", db, env });
server.listen(env.port, () => console.log(`voice-gateway listening on :${env.port}`));

function withTimeout(p: Promise<unknown>, ms: number, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    p.then(
      () => {
        clearTimeout(t);
        resolve();
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

let stopping = false;
async function stop(signal: string, failed = false) {
  if (stopping) return;
  stopping = true;
  console.log(JSON.stringify({ level: "info", msg: "signal received", signal }));
  // Last-resort exit if the drain or pool shutdown hangs (drain itself is bounded at 10 s).
  const hardExit = setTimeout(() => {
    console.error(JSON.stringify({ level: "error", msg: "shutdown hard exit" }));
    process.exit(1);
  }, HARD_EXIT_MS);
  hardExit.unref();
  let code = failed ? 1 : 0;
  try {
    await server.shutdown();
  } catch (e) {
    code = 1;
    console.error(
      JSON.stringify({ level: "error", msg: "shutdown failed", err: (e as Error)?.name }),
    );
  }
  try {
    await withTimeout(pool.end(), POOL_END_TIMEOUT_MS, "pool.end");
  } catch (e) {
    code = 1;
    console.error(
      JSON.stringify({ level: "error", msg: "pool shutdown failed", err: (e as Error)?.message }),
    );
  }
  process.exit(code);
}
process.on("SIGTERM", () => void stop("SIGTERM"));
process.on("SIGINT", () => void stop("SIGINT"));

// A stray rejection must not drop every live call: log the error name only and keep running.
process.on("unhandledRejection", (reason) => {
  console.error(
    JSON.stringify({
      level: "error",
      msg: "unhandled rejection",
      err: (reason as Error | undefined)?.name ?? typeof reason,
    }),
  );
});
// State after an uncaught exception is unknown: drain live calls, then exit non-zero.
process.on("uncaughtException", (e) => {
  console.error(JSON.stringify({ level: "error", msg: "uncaught exception", err: e?.name }));
  void stop("uncaughtException", true);
});
