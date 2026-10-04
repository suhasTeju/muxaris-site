import { CognitoJwtVerifier } from "aws-jwt-verify";
import {
  CognitoIdentityProviderClient,
  GetUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";

/** Cognito could not be reached to complete verification (network/5xx): retryable, not a bad token. */
export class AuthUnavailableError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("authentication service unavailable", options);
    this.name = "AuthUnavailableError";
  }
}

export interface VerifiedToken {
  sub: string;
  email?: string;
  username: string;
}

export interface TokenVerifier {
  verify(token: string): Promise<VerifiedToken>;
}

/** Minimal shape of the aws-jwt-verify verifier we depend on (stubbable in tests). */
export interface AccessTokenVerifier {
  verify(token: string): Promise<{ sub: string; username?: string; [k: string]: unknown }>;
}

export interface CognitoVerifierOptions {
  userPoolId: string;
  clientId: string;
  region?: string;
  /** Test seams. */
  jwtVerifier?: AccessTokenVerifier;
  fetchEmail?: (accessToken: string) => Promise<string | undefined>;
  /** Cognito client stub; only `send(GetUserCommand)` is used. */
  client?: {
    send(cmd: GetUserCommand): Promise<{ UserAttributes?: { Name?: string; Value?: string }[] }>;
  };
  now?: () => number;
}

const EMAIL_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE = 5000;

export function createCognitoVerifier(opts: CognitoVerifierOptions): TokenVerifier {
  const region = opts.region ?? opts.userPoolId.split("_")[0]!;
  const jwt: AccessTokenVerifier =
    opts.jwtVerifier ??
    (CognitoJwtVerifier.create({
      userPoolId: opts.userPoolId,
      clientId: opts.clientId,
      tokenUse: "access",
    }) as unknown as AccessTokenVerifier);
  const now = opts.now ?? Date.now;
  let realClient: CognitoIdentityProviderClient | undefined;
  const fetchEmail =
    opts.fetchEmail ??
    (async (accessToken: string) => {
      const client = opts.client ?? (realClient ??= new CognitoIdentityProviderClient({ region }));
      const out = await client.send(new GetUserCommand({ AccessToken: accessToken }));
      const attr = (n: string) => out.UserAttributes?.find((x) => x.Name === n)?.Value;
      // Only a verified email is trusted as an identity attribute.
      return attr("email_verified") === "true" ? attr("email") : undefined;
    });
  const cache = new Map<string, { email: string | undefined; expires: number }>();

  return {
    async verify(token) {
      const payload = await jwt.verify(token);
      const sub = payload.sub;
      const username = String(payload.username ?? sub);
      let hit = cache.get(sub);
      if (!hit || hit.expires <= now()) {
        let email: string | undefined;
        try {
          email = await fetchEmail(token);
        } catch (e) {
          const name = (e as { name?: string })?.name ?? "";
          // A rejected/expired token is the caller's problem; anything else is transient.
          if (name === "NotAuthorizedException" || name === "InvalidParameterException") throw e;
          throw new AuthUnavailableError({ cause: e });
        }
        hit = { email, expires: now() + EMAIL_TTL_MS };
        // Only verified emails are cached, so a user who verifies mid-session is picked up.
        if (email) {
          if (cache.size >= MAX_CACHE) cache.clear();
          cache.set(sub, hit);
        }
      }
      return hit.email ? { sub, email: hit.email, username } : { sub, username };
    },
  };
}

/** Accepts only `dev:<sub>:<email>`. For local development and tests; never wire in production. */
export function createDevVerifier(): TokenVerifier {
  return {
    async verify(token) {
      const m = /^dev:([^:\s]+):([^:\s]+@[^:\s]+)$/.exec(token);
      if (!m) throw new Error("invalid dev token");
      return { sub: m[1]!, email: m[2]!, username: m[1]! };
    },
  };
}
