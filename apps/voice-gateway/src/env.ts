export interface VoiceEnv {
  port: number;
  databaseUrl: string;
  sarvamKey: string | null;
  provider: "sarvam" | "mock";
  bedrockModelId: string;
  maxSessions: number;
}

export function loadEnv(src: NodeJS.ProcessEnv = process.env): VoiceEnv {
  let databaseUrl = src.DATABASE_URL;
  if (!databaseUrl) {
    if (src.NODE_ENV === "production")
      throw new Error("DATABASE_URL is required (see .env.example)");
    databaseUrl = "postgres://muxaris:muxaris@localhost:5433/muxaris";
    console.warn("DATABASE_URL not set: using local dev default (localhost:5433)");
  }
  const sarvamKey = src.SARVAM_TTS_API_KEY?.trim() || null;
  return {
    port: Number(src.VOICE_PORT ?? 4100),
    databaseUrl,
    sarvamKey,
    provider: sarvamKey ? "sarvam" : "mock",
    // Amazon Nova only (no Anthropic models on Bedrock)
    bedrockModelId: src.BEDROCK_MODEL_ID?.trim() || "global.amazon.nova-2-lite-v1:0",
    maxSessions: Number(src.MAX_SESSIONS ?? 15),
  };
}
