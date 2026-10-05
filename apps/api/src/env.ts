import { billingFromEnv, type BillingEnv } from "@muxaris/core";
import { channelFlagsFromEnv, type ChannelFlags } from "@muxaris/shared";

export interface ApiEnv {
  port: number;
  databaseUrl: string;
  sarvamKey: string | null;
  provider: "sarvam" | "mock";
  corsOrigins: string[];
  authMode: "cognito" | "dev";
  cognitoUserPoolId: string | null;
  cognitoClientId: string | null;
  callsBucket: string;
  awsRegion: string;
  storageDisabled: boolean;
  channels: ChannelFlags;
  billing: BillingEnv;
  telephony: TelephonyEnv;
}

export interface TelephonyEnv {
  provider: "none" | "twilio" | "exotel";
  twilioAuthToken: string | null;
  streamSecret: string | null;
  publicApiUrl: string;
  voiceWssUrl: string;
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
  const telProvider = src.TELEPHONY_PROVIDER?.trim() || "none";
  if (telProvider !== "none" && telProvider !== "twilio" && telProvider !== "exotel")
    throw new Error(`TELEPHONY_PROVIDER must be "twilio", "exotel" or empty, got "${telProvider}"`);
  const twilioAuthToken = src.TWILIO_AUTH_TOKEN?.trim() || null;
  const streamSecret = src.TELEPHONY_STREAM_SECRET?.trim() || null;
  if (telProvider === "twilio" && (!twilioAuthToken || !streamSecret))
    throw new Error(
      "TWILIO_AUTH_TOKEN and TELEPHONY_STREAM_SECRET are required when TELEPHONY_PROVIDER=twilio",
    );
  const sarvamKey = src.SARVAM_TTS_API_KEY?.trim() || null;
  const callsBucket = src.CALLS_BUCKET?.trim() ?? "";
  return {
    callsBucket,
    awsRegion: src.AWS_REGION?.trim() || "ap-south-1",
    storageDisabled: src.STORAGE_DISABLED === "1" || !callsBucket,
    channels: channelFlagsFromEnv(src),
    billing: billingFromEnv(src),
    telephony: {
      provider: telProvider,
      twilioAuthToken,
      streamSecret,
      publicApiUrl: (src.PUBLIC_API_URL?.trim() || "http://localhost:4000").replace(/\/+$/, ""),
      voiceWssUrl: (src.VOICE_WSS_URL?.trim() || "ws://localhost:4100").replace(/\/+$/, ""),
    },
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
