export interface WorkerEnv {
  databaseUrl: string;
  /** Empty means unset; dev.ts refuses to start without it. */
  queueUrl: string;
  modelId: string;
  awsRegion: string;
}

export function loadEnv(src: NodeJS.ProcessEnv = process.env): WorkerEnv {
  let databaseUrl = src.DATABASE_URL;
  if (!databaseUrl) {
    if (src.NODE_ENV === "production")
      throw new Error("DATABASE_URL is required (see .env.example)");
    databaseUrl = "postgres://muxaris:muxaris@localhost:5433/muxaris";
    console.warn("DATABASE_URL not set: using local dev default (localhost:5433)");
  }
  return {
    databaseUrl,
    queueUrl: src.POST_CALL_QUEUE_URL?.trim() ?? "",
    // Amazon Nova only (no Anthropic models on Bedrock)
    modelId: src.POST_CALL_MODEL_ID?.trim() || "apac.amazon.nova-pro-v1:0",
    awsRegion: src.AWS_REGION?.trim() || "ap-south-1",
  };
}
