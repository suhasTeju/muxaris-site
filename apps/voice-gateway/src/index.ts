import { createDb } from "@muxaris/db";
import { loadEnv } from "./env.js";
import { createServer } from "./server.js";

const env = loadEnv();
if (env.provider === "mock")
  console.warn("SARVAM_TTS_API_KEY not set: running with mock voice providers");
const { db } = createDb(env.databaseUrl);
const server = createServer({ version: process.env.GIT_SHA || "dev", db, env });
server.listen(env.port, () => console.log(`voice-gateway listening on :${env.port}`));
