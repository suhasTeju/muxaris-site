export interface VoiceEnv {
  port: number;
  databaseUrl: string;
  sarvamKey: string | null;
  provider: "sarvam" | "mock";
}

export function loadEnv(src: NodeJS.ProcessEnv = process.env): VoiceEnv {
  const databaseUrl = src.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required (see .env.example)");
  const sarvamKey = src.SARVAM_TTS_API_KEY?.trim() || null;
  return {
    port: Number(src.VOICE_PORT ?? 4100),
    databaseUrl,
    sarvamKey,
    provider: sarvamKey ? "sarvam" : "mock",
  };
}
