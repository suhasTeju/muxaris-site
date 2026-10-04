interface RawEnv {
  nodeEnv: string | undefined;
  apiUrl: string | undefined;
  voiceWsUrl: string | undefined;
}

const raw = (): RawEnv => ({
  // Literal process.env.NEXT_PUBLIC_* accesses so Next can inline them into the client bundle.
  nodeEnv: process.env.NODE_ENV,
  apiUrl: process.env.NEXT_PUBLIC_API_URL,
  voiceWsUrl: process.env.NEXT_PUBLIC_VOICE_WS_URL,
});

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]", "::1", "0.0.0.0"];

/**
 * Throws a clear Error when a production browser session (not on localhost) is missing
 * NEXT_PUBLIC_API_URL / NEXT_PUBLIC_VOICE_WS_URL or has a non-wss voice URL. Never runs at module
 * evaluation, so `next build` is unaffected.
 */
export function assertRuntimeEnv(
  r: RawEnv = raw(),
  hostname: string | undefined = typeof window === "undefined"
    ? undefined
    : window.location.hostname,
): void {
  if (r.nodeEnv !== "production" || hostname === undefined || LOCAL_HOSTS.includes(hostname)) {
    return;
  }
  if (!r.apiUrl)
    throw new Error("This deployment is misconfigured: NEXT_PUBLIC_API_URL is not set");
  if (!r.voiceWsUrl) {
    throw new Error("This deployment is misconfigured: NEXT_PUBLIC_VOICE_WS_URL is not set");
  }
  if (!r.voiceWsUrl.startsWith("wss:")) {
    throw new Error("This deployment is misconfigured: NEXT_PUBLIC_VOICE_WS_URL must use wss:");
  }
}

const base = raw();
export const env = {
  apiUrl: base.apiUrl || "http://localhost:4000",
  voiceWsUrl: base.voiceWsUrl || "ws://localhost:4100",
  cognito: {
    userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ?? "",
    clientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? "",
    domain: process.env.NEXT_PUBLIC_COGNITO_DOMAIN ?? "",
  },
} as const;
