import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadEnv } from "./env.js";

const env = loadEnv();
if (env.provider === "mock")
  console.warn("SARVAM_TTS_API_KEY not set: running with mock voice providers");
const app = createApp({ version: process.env.GIT_SHA ?? "dev", corsOrigins: env.corsOrigins });
serve({ fetch: app.fetch, port: env.port }, () => console.log(`api listening on :${env.port}`));
