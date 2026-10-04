export interface ApiEnv {
  port: number;
  databaseUrl: string;
  sarvamKey: string | null;
  provider: "sarvam" | "mock";
  corsOrigins: string[];
}

export function loadEnv(src: NodeJS.ProcessEnv = process.env): ApiEnv {
  const databaseUrl = src.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required (see .env.example)");
  const sarvamKey = src.SARVAM_TTS_API_KEY?.trim() || null;
  return {
    port: Number(src.API_PORT ?? 4000),
    databaseUrl,
    sarvamKey,
    provider: sarvamKey ? "sarvam" : "mock",
    corsOrigins: (
      src.CORS_ORIGINS ?? "http://localhost:3000,https://muxaris.com,https://www.muxaris.com"
    )
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
  };
}
