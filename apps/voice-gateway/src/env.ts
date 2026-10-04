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

/** Positive integer from an env var; throws at boot on empty, NaN, fractional or <= 0. */
function positiveInt(src: NodeJS.ProcessEnv, key: string, fallback: number, max?: number): number {
  const raw = src[key];
  if (raw === undefined) return fallback;
  const v = raw.trim();
  const n = /^\d+$/.test(v) ? Number(v) : NaN;
  if (!Number.isSafeInteger(n) || n <= 0 || (max !== undefined && n > max))
    throw new Error(`${key} must be a positive integer${max ? ` <= ${max}` : ""}, got "${raw}"`);
  return n;
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
  const forcedProvider = src.VOICE_PROVIDER?.trim();
  if (forcedProvider && forcedProvider !== "mock" && forcedProvider !== "sarvam")
    throw new Error(`VOICE_PROVIDER must be "sarvam" or "mock", got "${forcedProvider}"`);
  if (src.NODE_ENV === "production") {
    if (forcedProvider === "mock")
      throw new Error('VOICE_PROVIDER "mock" is not allowed in production');
    if (!sarvamKey) throw new Error("SARVAM_TTS_API_KEY is required in production");
  }
  const provider: "sarvam" | "mock" =
    forcedProvider === "mock" ? "mock" : sarvamKey ? "sarvam" : "mock";
  return {
    port: positiveInt(src, "VOICE_PORT", 4100, 65535),
    databaseUrl,
    sarvamKey,
    provider,
    // Amazon Nova only (no Anthropic models on Bedrock)
    bedrockModelId: src.BEDROCK_MODEL_ID?.trim() || "global.amazon.nova-2-lite-v1:0",
    awsRegion: src.AWS_REGION?.trim() || "ap-south-1",
    maxSessions: positiveInt(src, "MAX_SESSIONS", 15),
    maxCallSeconds: positiveInt(src, "MAX_CALL_SECONDS", 1200),
    corsOrigins: (src.CORS_ORIGINS ?? "http://localhost:3000")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    authMode,
    cognitoUserPoolId,
    cognitoClientId,
  };
}
