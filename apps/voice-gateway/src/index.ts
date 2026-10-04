import { createDb } from "@muxaris/db";
import { loadEnv } from "./env.js";
import { createServer } from "./server.js";

const env = loadEnv();
if (env.provider === "mock")
  console.warn("SARVAM_TTS_API_KEY not set: running with mock voice providers");
const { db, pool } = createDb(env.databaseUrl);
const server = createServer({ version: process.env.GIT_SHA || "dev", db, env });
server.listen(env.port, () => console.log(`voice-gateway listening on :${env.port}`));

let stopping = false;
async function stop(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(JSON.stringify({ level: "info", msg: "signal received", signal }));
  try {
    await server.shutdown();
    await pool.end();
  } catch (e) {
    console.error(
      JSON.stringify({ level: "error", msg: "shutdown failed", err: (e as Error)?.name }),
    );
  }
  process.exit(0);
}
process.on("SIGTERM", () => void stop("SIGTERM"));
process.on("SIGINT", () => void stop("SIGINT"));
