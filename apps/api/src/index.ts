import { serve } from "@hono/node-server";
import { createDb } from "@muxaris/db";
import { createCognitoVerifier, createDevVerifier, createRazorpayClient } from "@muxaris/core";
import { createS3BlobStore } from "@muxaris/storage";
import { createApp } from "./app.js";
import { loadEnv } from "./env.js";

const env = loadEnv();
if (env.provider === "mock")
  console.warn("SARVAM_TTS_API_KEY not set: running with mock voice providers");
const { db } = createDb(env.databaseUrl);
const verifier =
  env.authMode === "dev"
    ? createDevVerifier()
    : createCognitoVerifier({
        userPoolId: env.cognitoUserPoolId!,
        clientId: env.cognitoClientId!,
      });
if (env.authMode === "dev") console.warn("AUTH_MODE=dev: accepting dev:<sub>:<email> tokens");
const app = createApp({
  version: process.env.GIT_SHA || "dev",
  corsOrigins: env.corsOrigins,
  db,
  verifier,
  channels: env.channels,
  billing: {
    env: env.billing,
    client: env.billing.enabled
      ? createRazorpayClient({ keyId: env.billing.keyId!, keySecret: env.billing.keySecret! })
      : null,
  },
  blobs: env.storageDisabled
    ? null
    : createS3BlobStore({ bucket: env.callsBucket, region: env.awsRegion }),
});
serve({ fetch: app.fetch, port: env.port }, () => console.log(`api listening on :${env.port}`));
