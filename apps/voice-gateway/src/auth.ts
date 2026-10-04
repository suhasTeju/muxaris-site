import {
  AuthUnavailableError,
  createCognitoVerifier,
  createDevVerifier,
  type TokenVerifier,
} from "@muxaris/core";
import type { VoiceEnv } from "./env.js";

export { AuthUnavailableError };

export function createVerifier(
  env: Pick<VoiceEnv, "authMode" | "cognitoUserPoolId" | "cognitoClientId">,
): TokenVerifier {
  if (env.authMode === "dev") return createDevVerifier();
  return createCognitoVerifier({
    userPoolId: env.cognitoUserPoolId!,
    clientId: env.cognitoClientId!,
  });
}
