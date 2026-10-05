export const ACCOUNT = "005533348545";
export const REGION = "ap-south-1";
export const ENV = { account: ACCOUNT, region: REGION } as const;
export const PROJECT = "muxaris";
export const DOMAIN = "muxaris.com";
export const WEB_ORIGINS = [
  "https://muxaris.com",
  "https://www.muxaris.com",
  "http://localhost:3000",
];
export const API_HOST = "api.muxaris.com";
export const VOICE_HOST = "voice.muxaris.com";
/** The API's public URL, derived (never read from the environment, which may hold a local value). */
export const PUBLIC_API_URL = `https://${API_HOST}`;

type Env = Record<string, string | undefined>;

export interface ConfigProblems {
  /** Reasons MuxarisServices must not be synthesized. */
  services: string[];
  /** Reasons MuxarisMigrate must not be synthesized. */
  migrate: string[];
  /** Reasons MuxarisCicd must not be synthesized. */
  cicd: string[];
}

/**
 * Checks the deploy configuration. The bin attaches each list to its stack as an error, so only
 * the stacks that need the values refuse to synth: MuxarisAuth deploys on an empty account.
 */
export function validateConfig(env: Env): ConfigProblems {
  const imageTag: string[] = [];
  if (!env.IMAGE_TAG) {
    imageTag.push(
      "IMAGE_TAG is empty: set it to a tag that exists in ECR (scripts/push-images.sh prints IMAGE_TAG=...). 'latest' is never pushed.",
    );
  }
  const cognito: string[] = [];
  if (!env.COGNITO_USER_POOL_ID || !env.COGNITO_CLIENT_ID) {
    cognito.push(
      "COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID must be set (deploy MuxarisAuth first; scripts/bootstrap-aws.sh prints them).",
    );
  }
  const services = [...imageTag, ...cognito];
  if (!env.CERT_ARN && env.ALLOW_HTTP_ONLY !== "1") {
    services.push(
      "CERT_ARN is empty: deploying MuxarisServices without it removes the HTTPS listener and breaks https://api and wss://voice. Set CERT_ARN, or set ALLOW_HTTP_ONLY=1 for the deliberate HTTP-only state before the certificate exists.",
    );
  }
  const provider = env.TELEPHONY_PROVIDER ?? "";
  if (provider !== "" && provider !== "twilio" && provider !== "exotel") {
    services.push(`TELEPHONY_PROVIDER must be "twilio", "exotel" or empty, got "${provider}".`);
  }
  return { services, migrate: imageTag, cicd: cognito };
}
