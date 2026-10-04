import { Amplify, type ResourcesConfig } from "aws-amplify";
import { env } from "./env";

export const authConfigured = Boolean(env.cognito.userPoolId && env.cognito.clientId);
export const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_ENABLED === "1";

export function buildAmplifyConfig(origin: string): ResourcesConfig {
  return {
    Auth: {
      Cognito: {
        userPoolId: env.cognito.userPoolId,
        userPoolClientId: env.cognito.clientId,
        loginWith: {
          email: true,
          ...(env.cognito.domain
            ? {
                oauth: {
                  domain: env.cognito.domain,
                  scopes: ["openid", "email", "profile"],
                  redirectSignIn: [`${origin}/auth/callback`],
                  redirectSignOut: [`${origin}/`],
                  responseType: "code" as const,
                },
              }
            : {}),
        },
      },
    },
  };
}

let configured = false;
export function configureAmplify(): void {
  if (configured || !authConfigured) return;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  Amplify.configure(buildAmplifyConfig(origin), { ssr: true });
  configured = true;
}
