export interface VoiceEnv {
  port: number;
  databaseUrl: string;
  sarvamKey: string | null;
  provider: "sarvam" | "mock";
  bedrockModelId: string;
  awsRegion: string;
  maxSessions: number;
  maxCallSeconds: number;
  corsOrigins: string[];
  authMode: "cognito" | "dev";
  cognitoUserPoolId: string | null;
  cognitoClientId: string | null;
}

export function loadEnv(src: NodeJS.ProcessEnv = process.env): VoiceEnv {
  let databaseUrl = src.DATABASE_URL;
  if (!databaseUrl) {
    if (src.NODE_ENV === "production")
      throw new Error("DATABASE_URL is required (see .env.example)");
    databaseUrl = "postgres://muxaris:muxaris@localhost:5433/muxaris";
    console.warn("DATABASE_URL not set: using local dev default (localhost:5433)");
  }
  const authMode = (src.AUTH_MODE?.trim() || "cognito") as string;
  if (authMode !== "cognito" && authMode !== "dev")
    throw new Error(`AUTH_MODE must be "cognito" or "dev", got "${authMode}"`);
  if (authMode === "dev" && src.NODE_ENV === "production")
    throw new Error('AUTH_MODE "dev" is not allowed in production');
  const cognitoUserPoolId = src.COGNITO_USER_POOL_ID?.trim() || null;
  const cognitoClientId = src.COGNITO_CLIENT_ID?.trim() || null;
  if (authMode === "cognito" && (!cognitoUserPoolId || !cognitoClientId))
    throw new Error(
      "COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID are required when AUTH_MODE=cognito",
    );
  const sarvamKey = src.SARVAM_TTS_API_KEY?.trim() || null;
  return {
    port: Number(src.VOICE_PORT ?? 4100),
    databaseUrl,
    sarvamKey,
    provider: sarvamKey ? "sarvam" : "mock",
    // Amazon Nova only (no Anthropic models on Bedrock)
    bedrockModelId: src.BEDROCK_MODEL_ID?.trim() || "global.amazon.nova-2-lite-v1:0",
    awsRegion: src.AWS_REGION?.trim() || "ap-south-1",
    maxSessions: Number(src.MAX_SESSIONS ?? 15),
    maxCallSeconds: Number(src.MAX_CALL_SECONDS ?? 600),
    corsOrigins: (src.CORS_ORIGINS ?? "http://localhost:3000")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    authMode,
    cognitoUserPoolId,
    cognitoClientId,
  };
}
