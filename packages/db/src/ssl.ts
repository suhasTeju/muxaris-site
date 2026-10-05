import { readFileSync } from "node:fs";
import type pg from "pg";
import { RDS_GLOBAL_CA_BUNDLE } from "./rds-ca.js";

/**
 * SSL for the Postgres pool. Unset → plain (local Docker). "verify" (what every deployed
 * process uses) → chain verified against the embedded RDS global CA bundle, or DATABASE_SSL_CA
 * when set. "no-verify" encrypts without verifying and exists for ad-hoc debugging only.
 */
export function sslFromEnv(src: NodeJS.ProcessEnv): pg.PoolConfig["ssl"] | undefined {
  const mode = src.DATABASE_SSL?.trim();
  if (!mode) return undefined;
  if (mode === "verify") {
    const path = src.DATABASE_SSL_CA?.trim();
    return {
      rejectUnauthorized: true,
      ca: path ? readFileSync(path, "utf8") : RDS_GLOBAL_CA_BUNDLE,
    };
  }
  if (mode === "no-verify") return { rejectUnauthorized: false };
  throw new Error(`DATABASE_SSL must be "verify" or "no-verify", got "${mode}"`);
}
