interface RawEnv {
  nodeEnv: string | undefined;
  apiUrl: string | undefined;
  voiceWsUrl: string | undefined;
}

/** Dev keeps localhost defaults; a production build must set both URLs (and the WS one must be wss:). */
export function resolveUrls(raw: RawEnv): { apiUrl: string; voiceWsUrl: string } {
  if (raw.nodeEnv === "production") {
    if (!raw.apiUrl) throw new Error("NEXT_PUBLIC_API_URL must be set in production");
    if (!raw.voiceWsUrl) throw new Error("NEXT_PUBLIC_VOICE_WS_URL must be set in production");
    if (!raw.voiceWsUrl.startsWith("wss:")) {
      throw new Error("NEXT_PUBLIC_VOICE_WS_URL must use wss: in production");
    }
  }
  return {
    apiUrl: raw.apiUrl || "http://localhost:4000",
    voiceWsUrl: raw.voiceWsUrl || "ws://localhost:4100",
  };
}

// Literal process.env.NEXT_PUBLIC_* accesses so Next can inline them into the client bundle.
const urls = resolveUrls({
  nodeEnv: process.env.NODE_ENV,
  apiUrl: process.env.NEXT_PUBLIC_API_URL,
  voiceWsUrl: process.env.NEXT_PUBLIC_VOICE_WS_URL,
});

export const env = {
  apiUrl: urls.apiUrl,
  voiceWsUrl: urls.voiceWsUrl,
  cognito: {
    userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ?? "",
    clientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? "",
    domain: process.env.NEXT_PUBLIC_COGNITO_DOMAIN ?? "",
  },
} as const;
