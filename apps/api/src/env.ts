export interface ApiEnv {
  port: number;
  databaseUrl: string;
  sarvamKey: string | null;
  provider: "sarvam" | "mock";
  corsOrigins: string[];
  authMode: "cognito" | "dev";
  cognitoUserPoolId: string | null;
  cognitoClientId: string | null;
}

export function loadEnv(src: NodeJS.ProcessEnv = process.env): ApiEnv {
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
    port: Number(src.API_PORT ?? 4000),
    databaseUrl,
    sarvamKey,
    authMode,
    cognitoUserPoolId,
    cognitoClientId,
    provider: sarvamKey ? "sarvam" : "mock",
    corsOrigins: (
      src.CORS_ORIGINS ?? "http://localhost:3000,https://muxaris.com,https://www.muxaris.com"
    )
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
  };
}
