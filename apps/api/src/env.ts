export interface ApiEnv {
  port: number;
  databaseUrl: string;
  sarvamKey: string | null;
  provider: "sarvam" | "mock";
  corsOrigins: string[];
}

export function loadEnv(src: NodeJS.ProcessEnv = process.env): ApiEnv {
  let databaseUrl = src.DATABASE_URL;
  if (!databaseUrl) {
    if (src.NODE_ENV === "production")
      throw new Error("DATABASE_URL is required (see .env.example)");
    databaseUrl = "postgres://muxaris:muxaris@localhost:5433/muxaris";
    console.warn("DATABASE_URL not set: using local dev default (localhost:5433)");
  }
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
