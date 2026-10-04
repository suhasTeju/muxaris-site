export const env = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
  voiceWsUrl: process.env.NEXT_PUBLIC_VOICE_WS_URL ?? "ws://localhost:4100",
  cognito: {
    userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ?? "",
    clientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? "",
    domain: process.env.NEXT_PUBLIC_COGNITO_DOMAIN ?? "",
  },
} as const;
