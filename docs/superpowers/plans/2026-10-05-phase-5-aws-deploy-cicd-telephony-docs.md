# Phase 5: AWS deployment, CI/CD, telephony readiness, docs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the API, voice gateway and workers on AWS ap-south-1 from scripted CDK, with CI/CD, dashboards and alarms, a Twilio media-stream transport that activates by env, and the docs an operator (and the credits application) needs.

**Architecture:** Two Fargate (ARM64) services behind one ALB (host rules `api.` / `voice.`, idle timeout 3600 s), RDS Postgres 16 in isolated subnets, three Lambdas in private subnets reaching AWS APIs through one NAT gateway, SQS event-source mapping with partial batch failures, EventBridge schedules, Secrets Manager for every secret (resolved at process start by one helper, never baked into templates), CloudWatch metric filters → dashboard → alarms → SNS email, GitHub OIDC deploy role. Migrations run as an ECS one-off task from the API image. Telephony: `TwilioMediaStreamTransport` implements the existing `MediaTransport` (μ-law 8 kHz ↔ PCM16), a signed TwiML webhook mints a short-lived stream token, a `phone_numbers` table maps the dialled number to the clinic.

**Tech Stack:** aws-cdk-lib ^2.200 (TypeScript, ESM), `aws-lambda-nodejs` + esbuild, Docker multi-stage `node:22-alpine` (linux/arm64), GitHub Actions, Vitest, Hono, `ws`, `pg`.

**Spec:** `docs/superpowers/specs/2026-10-04-muxaris-platform-design.md` (sections "Infra", "CI/CD", "Scripts", "Phase 5", "Known limits", "Verification"). Facts gathered before planning: session scratchpad `phase-5-facts.md`. Operational requirements already written down: `docs/ARCHITECTURE.md` "Phase 5 IAM" and "Operations notes".

## Global Constraints

- **AWS account:** only `005533348545` / profile `aws-secondary-account` / `ap-south-1`. Every aws/cdk invocation goes through `infra/scripts/cdk.sh` or sources `scripts/lib/aws-guard.sh` first. `infra/bin/muxaris.ts` keeps its `CDK_DEFAULT_ACCOUNT` refusal. Never the primary account.
- **No secret value in git, templates, logs or reports.** `cdk synth` output must contain no `.env` value; `grep -r` the `cdk.out` templates for `SecretString` and for every value in `.env` → zero hits. Never use `SecretValue.unsafeUnwrap()`. Scripts that read `.env` never `echo` a value. Reports list key names only.
- **Never log tokens, transcripts, phone numbers, names, emails, presigned URLs, Twilio auth token or signatures.** Twilio `From`/`To` numbers are logged masked (`+91••••••1234`) or not at all.
- **Code conventions:** strict TS (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), ESLint `no-explicit-any` error, Prettier 100, ESM `.js` import specifiers, Vitest. API/gateway/worker tests read `@muxaris/core` and `@muxaris/db` from BUILT output: `npm run build:packages` after any package change. Postgres-gated tests use `(reachable ? describe : describe.skip)` with Docker Postgres on localhost:5433.
- **Gate before every commit:** `npm run build:packages && npm run typecheck && npm run lint && npx prettier --check .` and the task's tests. Commit trailer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- **Bedrock models:** Amazon Nova only (`global.amazon.nova-2-lite-v1:0` gateway, `apac.amazon.nova-pro-v1:0` post-call). Never Anthropic models on Bedrock.
- **Netlify** deploys `apps/web` on push to `main`; nothing in this phase changes `netlify.toml` except documentation comments.
- **Monthly cost** of the deployed stacks (Task 8) is stated in this plan and repeated in the close-out: about ₹8,500–9,500 / US$100–115 per month (RDS db.t4g.micro + 20 GB ≈ $16, two Fargate ARM tasks 0.5 vCPU/1 GB ≈ $23, ALB ≈ $20, NAT gateway ≈ $33 + data, Lambda/SQS/EventBridge ≈ $1, CloudWatch ≈ $4, Secrets/ECR ≈ $3).

## Review Focus

1. **Fresh database on RDS.** The first `migrate` runs 0000–0006 in one Drizzle transaction over verified TLS (RDS forces SSL). Expected: it succeeds. Pinned by Task 1's fresh-database container test and Task 1's `sslFromEnv` tests.
2. **Lambda egress.** A Lambda in a private subnet with no route to the internet cannot reach Bedrock, SES, SQS or Secrets Manager; the symptom is a silent timeout. Expected: every Lambda subnet routes through the NAT gateway. Pinned by Task 3's Network stack test (private subnets with egress) and Task 4's Workers stack test (functions placed in `PRIVATE_WITH_EGRESS`).
3. **A deploy must not cut a recording upload.** Expected: ECS `stopTimeout` (90 s) exceeds the gateway's 60 s upload budget plus its 13 s drain. Pinned by Task 5's Services stack test.
4. **No secret in a template.** Expected: synth output contains no secret value and no `SecretString`; task definitions reference secret ARNs only. Pinned by Task 5's test (`Template.toJSON()` stringified has no `SecretString`, env vars contain only ARNs) and Task 8's `grep` step.
5. **A forged Twilio request must not start a call.** Expected: a webhook with a bad `X-Twilio-Signature` is 403 and never looks up a clinic; a media stream with a bad or expired token is closed with 4001 before any DB write. Pinned by Task 9's tests.

---

## Rulings made while planning (binding; log deviations in the ledger)

- **R1 Lambda egress = one NAT gateway** (single AZ, ~$33/mo). Interface endpoints for Secrets Manager, SQS, Bedrock and SES cost about the same and add four resources; a Fargate "workers" service would be cheaper (~$6/mo) but drops Lambda and EventBridge from the architecture the credits application describes. Cheaper fallback documented in `docs/AWS-SERVICES.md`.
- **R2 RDS SSL = verified against the embedded RDS global CA bundle.** `DATABASE_SSL=verify` → `ssl: { rejectUnauthorized: true, ca: <bundle> }` where the bundle is the public `global-bundle.pem` from `truststore.pki.rds.amazonaws.com`, committed as a TypeScript string module in `packages/db` so images and Lambda bundles carry it without file copies; `DATABASE_SSL_CA=<path>` overrides it. `no-verify` exists only for ad-hoc debugging and is never set by any stack.
- **R3 Secrets reach processes one way:** `applySecretsToEnv()` in `packages/db` reads `DB_SECRET_ARN` (the RDS-generated secret, JSON `{username,password,host,port,dbname}`) and `APP_SECRET_ARN` (`muxaris/app`, JSON of key→value) at start and fills `process.env` for keys not already set. ECS tasks and Lambdas get the ARNs plus `secretsmanager:GetSecretValue`. No ECS-native secret injection, no `{{resolve:}}` dynamic references.
- **R4 Gateway runs one task, no autoscaling** (per-process concurrency counters, see ARCHITECTURE). API autoscales 1→2 on CPU 70 %. Revisit when a shared counter store exists.
- **R5 Certificates are requested by script, not CDK.** `scripts/request-cert.sh` prints the ACM validation CNAMEs immediately; the Services stack adds the HTTPS listener and the HTTP→HTTPS redirect only when `CERT_ARN` is set in `.env`. Until the user validates the cert, the ALB serves HTTP on its default hostname and the Netlify site cannot reach the gateway (`assertRuntimeEnv` requires `wss:` in production; browsers block mixed content). Stated in the close-out.
- **R6 Smoke test needs no Cognito sign-in.** `scripts/smoke.sh` checks both health endpoints, a 401 without a token, a 403 WebSocket upgrade from a foreign origin, and optionally an authenticated call when the user supplies `SMOKE_TOKEN`.
- **R7 ECR repositories live in the Data stack** so images can be pushed before the Services stack creates task definitions that reference them.
- **R8 Telephony stream auth:** Twilio does not sign the media-stream WebSocket, so the webhook mints an HMAC token (`TELEPHONY_STREAM_SECRET`, 5-minute expiry, bound to call SID + clinic id) passed as a TwiML `<Parameter>`; the gateway verifies it before creating a call. Exotel ships as a documented stub.

---

### Task 1: Container images and the migration runner

**Files:**
- Modify: `apps/api/Dockerfile`, `apps/voice-gateway/Dockerfile`, `packages/db/src/client.ts`, `packages/db/src/migrate.ts`, `packages/db/src/index.ts`, `.env.example`
- Create: `packages/db/src/ssl.ts`, `packages/db/src/ssl.test.ts`, `scripts/build-images.sh`, `scripts/test-fresh-db.sh`

**Interfaces:**
- Produces: `sslFromEnv(src: NodeJS.ProcessEnv): pg.PoolConfig["ssl"] | undefined`; `createDb(url)` now applies `sslFromEnv(process.env)`; the API image can run `node packages/db/dist/migrate.js`; images tag `muxaris-api:<tag>` and `muxaris-voice-gateway:<tag>` for linux/arm64.

- [ ] **Step 1: Failing tests for `sslFromEnv`** — `packages/db/src/ssl.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sslFromEnv } from "./ssl.js";

describe("sslFromEnv", () => {
  it("is undefined when DATABASE_SSL is unset or empty", () => {
    expect(sslFromEnv({})).toBeUndefined();
    expect(sslFromEnv({ DATABASE_SSL: "" })).toBeUndefined();
  });
  it("verify uses the embedded RDS global bundle by default", () => {
    const r = sslFromEnv({ DATABASE_SSL: "verify" }) as { rejectUnauthorized: boolean; ca: string };
    expect(r.rejectUnauthorized).toBe(true);
    expect(r.ca.split("-----BEGIN CERTIFICATE-----").length).toBeGreaterThan(100);
  });
  it("verify reads DATABASE_SSL_CA when given", () => {
    const r = sslFromEnv({ DATABASE_SSL: "verify", DATABASE_SSL_CA: "/dev/null" });
    expect(r).toEqual({ rejectUnauthorized: true, ca: "" });
  });
  it("no-verify is accepted for debugging only and encrypts without verifying the chain", () => {
    expect(sslFromEnv({ DATABASE_SSL: "no-verify" })).toEqual({ rejectUnauthorized: false });
  });
  it("rejects unknown modes", () => {
    expect(() => sslFromEnv({ DATABASE_SSL: "yes" })).toThrow(/DATABASE_SSL/);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run packages/db/src/ssl.test.ts` → fails (module missing).

- [ ] **Step 3: Implement** `packages/db/src/ssl.ts`:

```ts
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
    return { rejectUnauthorized: true, ca: path ? readFileSync(path, "utf8") : RDS_GLOBAL_CA_BUNDLE };
  }
  if (mode === "no-verify") return { rejectUnauthorized: false };
  throw new Error(`DATABASE_SSL must be "verify" or "no-verify", got "${mode}"`);
}
```

`packages/db/src/rds-ca.ts` is generated, not hand-written: copy the public bundle from the session scratchpad (`phase-5` controller downloaded it from `https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem` to `/private/tmp/claude-501/-Users-suhas-Documents-muxaris/732139d4-8398-4c0c-9767-a4e78e878f54/scratchpad/rds-global-bundle.pem`) with:

```bash
{ echo '// Generated from https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem (public RDS CA bundle).';
  echo '// Regenerate with scripts/update-rds-ca.sh. Do not edit by hand.';
  echo 'export const RDS_GLOBAL_CA_BUNDLE = `'; cat "$PEM"; echo '`;'; } > packages/db/src/rds-ca.ts
```

and add `scripts/update-rds-ca.sh` that does exactly that after `curl -fsSL` of the URL (the only script in the repo allowed to fetch from the internet; it touches no AWS account). Add `packages/db/src/rds-ca.ts` to `.prettierignore` and the ESLint ignore list if either tool chokes on the 170 KB literal (say so in the report).

`packages/db/src/client.ts`:

```ts
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";
import { sslFromEnv } from "./ssl.js";
export type Db = NodePgDatabase<typeof schema>;
export function createDb(url: string): { db: Db; pool: pg.Pool } {
  const ssl = sslFromEnv(process.env);
  const pool = new pg.Pool({ connectionString: url, max: 10, ...(ssl ? { ssl } : {}) });
  return { db: drizzle(pool, { schema }), pool };
}
```

Export `sslFromEnv` from `packages/db/src/index.ts`.

`packages/db/src/migrate.ts` gets a production guard (keep the rest):

```ts
const url = process.env.DATABASE_URL;
if (!url && process.env.NODE_ENV === "production")
  throw new Error("DATABASE_URL is required in production (set DB_SECRET_ARN or DATABASE_URL)");
const { db, pool } = createDb(url ?? "postgres://muxaris:muxaris@localhost:5433/muxaris");
```

(Task 2 adds the `applySecretsToEnv()` call at the top of this file.)

- [ ] **Step 4: Run** the ssl tests → pass. `npm run build:packages`.

- [ ] **Step 5: Dockerfiles.** Both images build from the repo root. `npm ci --workspace X` with the full lockfile needs every workspace manifest present, so copy all `package.json` files first. Replace `apps/api/Dockerfile` with:

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/voice-gateway/package.json apps/voice-gateway/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/core/package.json packages/core/
COPY packages/storage/package.json packages/storage/
COPY packages/voice-sdk/package.json packages/voice-sdk/
COPY workers/post-call/package.json workers/post-call/
COPY workers/notifier/package.json workers/notifier/
COPY infra/package.json infra/
RUN npm ci --workspace @muxaris/api --include-workspace-root
COPY packages/shared packages/shared
COPY packages/db packages/db
COPY packages/core packages/core
COPY packages/storage packages/storage
COPY apps/api apps/api
RUN npm run build -w @muxaris/shared && npm run build -w @muxaris/db \
 && npm run build -w @muxaris/core && npm run build -w @muxaris/storage \
 && npm run build -w @muxaris/api

FROM node:22-alpine
WORKDIR /repo
ENV NODE_ENV=production
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA
COPY --from=build /repo/package.json /repo/package-lock.json ./
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/shared/package.json packages/shared/
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/packages/db/package.json packages/db/
COPY --from=build /repo/packages/db/dist packages/db/dist
COPY --from=build /repo/packages/db/drizzle packages/db/drizzle
COPY --from=build /repo/packages/core/package.json packages/core/
COPY --from=build /repo/packages/core/dist packages/core/dist
COPY --from=build /repo/packages/storage/package.json packages/storage/
COPY --from=build /repo/packages/storage/dist packages/storage/dist
COPY --from=build /repo/apps/api/package.json apps/api/
COPY --from=build /repo/apps/api/dist apps/api/dist
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||4000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/index.js"]
```

`apps/voice-gateway/Dockerfile`: same build stage (copy the same manifests; `npm ci --workspace @muxaris/voice-gateway --include-workspace-root`; copy and build shared, db, core, storage, then the gateway), same runtime stage layout plus `packages/storage` dist, keep `USER node`, `EXPOSE 4100`, the existing HEALTHCHECK, `ARG GIT_SHA=dev` / `ENV GIT_SHA=$GIT_SHA`, and `CMD ["node", "apps/voice-gateway/dist/index.js"]`. If a package the app does not import is listed in `node_modules` anyway, that is fine; what matters is that every workspace the app imports is built and copied.

- [ ] **Step 6: `scripts/build-images.sh`** (local build, no push):

```bash
#!/usr/bin/env bash
# Builds both service images for linux/arm64 (Fargate Graviton). Usage: scripts/build-images.sh [tag]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TAG="${1:-$(git -C "$ROOT" rev-parse --short HEAD)}"
PLATFORM="${IMAGE_PLATFORM:-linux/arm64}"
for app in api voice-gateway; do
  echo "→ build muxaris-$app:$TAG ($PLATFORM)"
  docker build --platform "$PLATFORM" --build-arg "GIT_SHA=$TAG" \
    -f "$ROOT/apps/$app/Dockerfile" -t "muxaris-$app:$TAG" -t "muxaris-$app:latest" "$ROOT"
done
echo "built muxaris-api:$TAG muxaris-voice-gateway:$TAG"
```

- [ ] **Step 7: `scripts/test-fresh-db.sh`** — proves Review Focus 1 locally: a brand-new database, all migrations in one run, from the API image, then both images answer `/healthz`:

```bash
#!/usr/bin/env bash
# Runs the migration runner from the API image against a brand-new database on the dev Postgres,
# then starts both images and checks /healthz. Usage: scripts/test-fresh-db.sh [tag]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TAG="${1:-latest}"
DBNAME="fresh_$(date +%s)"
PGURL_HOST="postgres://muxaris:muxaris@localhost:5433"
docker exec muxaris-postgres psql -U muxaris -d muxaris -c "CREATE DATABASE $DBNAME" >/dev/null
cleanup() { docker exec muxaris-postgres psql -U muxaris -d muxaris -c "DROP DATABASE IF EXISTS $DBNAME" >/dev/null || true; docker rm -f fresh-api fresh-gw >/dev/null 2>&1 || true; }
trap cleanup EXIT
# host.docker.internal reaches the dev Postgres from inside a container on Docker Desktop
URL="postgres://muxaris:muxaris@host.docker.internal:5433/$DBNAME"
docker run --rm -e NODE_ENV=production -e DATABASE_URL="$URL" "muxaris-api:$TAG" node packages/db/dist/migrate.js
docker exec muxaris-postgres psql -U muxaris -d "$DBNAME" -tAc "SELECT count(*) FROM plans" | grep -qx 2
docker run -d --name fresh-api -p 4900:4000 -e NODE_ENV=production -e DATABASE_URL="$URL" -e AUTH_MODE=cognito \
  -e COGNITO_USER_POOL_ID=ap-south-1_x -e COGNITO_CLIENT_ID=x "muxaris-api:$TAG" >/dev/null
docker run -d --name fresh-gw -p 4901:4100 -e NODE_ENV=production -e DATABASE_URL="$URL" -e AUTH_MODE=cognito \
  -e COGNITO_USER_POOL_ID=ap-south-1_x -e COGNITO_CLIENT_ID=x -e SARVAM_TTS_API_KEY=x -e VOICE_PROVIDER=sarvam \
  "muxaris-voice-gateway:$TAG" >/dev/null
for i in $(seq 1 20); do
  if curl -fsS localhost:4900/healthz >/dev/null && curl -fsS localhost:4901/healthz >/dev/null; then echo "fresh-db OK ($DBNAME)"; exit 0; fi
  sleep 1
done
echo "healthz never came up"; docker logs fresh-api | tail -20; docker logs fresh-gw | tail -20; exit 1
```

Check what `apps/api/src/index.ts` and the gateway need at boot with `AUTH_MODE=cognito` and placeholder ids (the verifier is lazy; if either process exits at start with placeholder Cognito ids, use `AUTH_MODE=dev` with `NODE_ENV=development` for the health check instead and say so in the report).

- [ ] **Step 8: Run** `bash scripts/build-images.sh && bash scripts/test-fresh-db.sh` → `fresh-db OK`. Record the two image sizes in the report.

- [ ] **Step 9: `.env.example`** — add under the database block:

```
# Postgres SSL: unset for local Docker. Deployed processes use "verify" (chain checked against the
# embedded RDS global CA bundle; DATABASE_SSL_CA=/path overrides it). "no-verify" is for debugging only.
DATABASE_SSL=
DATABASE_SSL_CA=
```

- [ ] **Step 10: Gate, commit**

```bash
git add apps/api/Dockerfile apps/voice-gateway/Dockerfile packages/db/src .env.example scripts/build-images.sh scripts/test-fresh-db.sh scripts/update-rds-ca.sh
git commit -m "build(images): complete workspace copies, non-root API image, Postgres SSL modes, fresh-database migration check"
```

---

### Task 2: Secrets resolved at process start

**Files:**
- Create: `packages/db/src/secrets.ts`, `packages/db/src/secrets.test.ts`
- Modify: `packages/db/package.json` (dependency `@aws-sdk/client-secrets-manager` `^3`), `packages/db/src/index.ts`, `packages/db/src/migrate.ts`, `apps/api/src/index.ts`, `apps/voice-gateway/src/index.ts`, `workers/post-call/src/lambda.ts`, `workers/notifier/src/lambda.ts`, `.env.example`

**Interfaces:**
- Produces: `applySecretsToEnv(src?: NodeJS.ProcessEnv, client?: SecretsClient): Promise<{ applied: string[] }>`; `SecretsClient = { get(arn: string): Promise<string | undefined> }`; `databaseUrlFromRdsSecret(json: string): string`.

- [ ] **Step 1: Failing tests** `packages/db/src/secrets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applySecretsToEnv, databaseUrlFromRdsSecret } from "./secrets.js";

const fake = (map: Record<string, string>) => ({ get: async (arn: string) => map[arn] });

describe("databaseUrlFromRdsSecret", () => {
  it("builds a URL and encodes the password", () => {
    const url = databaseUrlFromRdsSecret(
      JSON.stringify({ username: "mux", password: "p@ss/w:rd", host: "db.internal", port: 5432, dbname: "muxaris" }),
    );
    expect(url).toBe("postgres://mux:p%40ss%2Fw%3Ard@db.internal:5432/muxaris");
  });
  it("rejects a secret missing a field", () => {
    expect(() => databaseUrlFromRdsSecret(JSON.stringify({ username: "a" }))).toThrow(/host/);
  });
});

describe("applySecretsToEnv", () => {
  it("does nothing without ARNs", async () => {
    const env: NodeJS.ProcessEnv = {};
    expect(await applySecretsToEnv(env, fake({}))).toEqual({ applied: [] });
    expect(env).toEqual({});
  });
  it("fills DATABASE_URL from DB_SECRET_ARN and app keys from APP_SECRET_ARN, never overriding set values", async () => {
    const env: NodeJS.ProcessEnv = { DB_SECRET_ARN: "arn:db", APP_SECRET_ARN: "arn:app", RAZORPAY_KEY_ID: "keep" };
    const r = await applySecretsToEnv(
      env,
      fake({
        "arn:db": JSON.stringify({ username: "u", password: "p", host: "h", port: 5432, dbname: "d" }),
        "arn:app": JSON.stringify({ SARVAM_TTS_API_KEY: "s", RAZORPAY_KEY_ID: "ignored", EMPTY: "" }),
      }),
    );
    expect(env.DATABASE_URL).toBe("postgres://u:p@h:5432/d");
    expect(env.SARVAM_TTS_API_KEY).toBe("s");
    expect(env.RAZORPAY_KEY_ID).toBe("keep");
    expect(env.EMPTY).toBeUndefined();
    expect(r.applied.sort()).toEqual(["DATABASE_URL", "SARVAM_TTS_API_KEY"]);
  });
  it("fails loudly when a named secret cannot be read", async () => {
    await expect(applySecretsToEnv({ DB_SECRET_ARN: "arn:missing" }, fake({}))).rejects.toThrow(/DB_SECRET_ARN/);
  });
  it("never puts a value in the error message", async () => {
    await expect(applySecretsToEnv({ APP_SECRET_ARN: "arn:bad" }, fake({ "arn:bad": "{not json" }))).rejects.toThrow(
      /APP_SECRET_ARN is not valid JSON$/,
    );
  });
});
```

- [ ] **Step 2: Run** → fails. **Step 3: Implement** `packages/db/src/secrets.ts`:

```ts
export interface SecretsClient {
  get(arn: string): Promise<string | undefined>;
}

/** Secrets Manager client loaded lazily so local runs never import the SDK. */
async function awsClient(): Promise<SecretsClient> {
  const { SecretsManagerClient, GetSecretValueCommand } = await import("@aws-sdk/client-secrets-manager");
  const c = new SecretsManagerClient({});
  return {
    get: async (arn) => (await c.send(new GetSecretValueCommand({ SecretId: arn }))).SecretString,
  };
}

/** RDS-generated secret ({username,password,host,port,dbname}) → postgres:// URL. */
export function databaseUrlFromRdsSecret(json: string): string {
  const o = JSON.parse(json) as Record<string, unknown>;
  for (const k of ["username", "password", "host", "port", "dbname"])
    if (o[k] === undefined || o[k] === "") throw new Error(`RDS secret is missing ${k}`);
  const u = encodeURIComponent(String(o.username));
  const p = encodeURIComponent(String(o.password));
  return `postgres://${u}:${p}@${String(o.host)}:${String(o.port)}/${String(o.dbname)}`;
}

/**
 * Fills process.env from Secrets Manager at start: DB_SECRET_ARN → DATABASE_URL (unless already
 * set) and APP_SECRET_ARN (JSON key→value) → each key not already set and not empty. Values never
 * appear in errors or logs; only key names are returned.
 */
export async function applySecretsToEnv(
  src: NodeJS.ProcessEnv = process.env,
  client?: SecretsClient,
): Promise<{ applied: string[] }> {
  const dbArn = src.DB_SECRET_ARN?.trim();
  const appArn = src.APP_SECRET_ARN?.trim();
  const applied: string[] = [];
  if (!dbArn && !appArn) return { applied };
  const c = client ?? (await awsClient());
  if (dbArn && !src.DATABASE_URL) {
    const raw = await c.get(dbArn);
    if (!raw) throw new Error("DB_SECRET_ARN could not be read");
    src.DATABASE_URL = databaseUrlFromRdsSecret(raw);
    applied.push("DATABASE_URL");
  }
  if (appArn) {
    const raw = await c.get(appArn);
    if (!raw) throw new Error("APP_SECRET_ARN could not be read");
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new Error("APP_SECRET_ARN is not valid JSON");
    }
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v !== "string" || v === "" || src[k]) continue;
      src[k] = v;
      applied.push(k);
    }
  }
  return { applied };
}
```

Export both from `packages/db/src/index.ts`. Add the dependency and run `npm install` (lockfile changes are part of the commit).

- [ ] **Step 4: Wire the entry points.** Each must await the resolver BEFORE `loadEnv()`:
  - `apps/api/src/index.ts` and `apps/voice-gateway/src/index.ts`: first statement `const { applied } = await applySecretsToEnv(); if (applied.length) console.log("secrets applied", { keys: applied });` (keys only).
  - `workers/post-call/src/lambda.ts` and `workers/notifier/src/lambda.ts`: inside `getDeps()` before `loadEnv()`, awaited once (make `getDeps` async and cache the promise; update the handlers accordingly; keep the tests green — check `workers/*/src/*.test.ts` for how `getDeps` is used).
  - `packages/db/src/migrate.ts`: first line `await applySecretsToEnv();`.
  - Local runs are unaffected (no ARNs → no SDK import). Verify: `npm run dev -w @muxaris/api` still boots (or the existing API tests, which import `createApp`, not `index.ts`).

- [ ] **Step 5: `.env.example`** — add under AWS:

```
# Deployed processes read secrets at start (never baked into images or templates):
# DB_SECRET_ARN  = the RDS-generated secret (JSON username/password/host/port/dbname) → DATABASE_URL
# APP_SECRET_ARN = muxaris/app (JSON key→value: SARVAM_TTS_API_KEY, RAZORPAY_*, WHATSAPP_TOKEN …)
DB_SECRET_ARN=
APP_SECRET_ARN=
```

- [ ] **Step 6: Gate** (`npm run build:packages && npx vitest run packages/db apps/api apps/voice-gateway workers`), commit:

```bash
git commit -m "feat(config): resolve DATABASE_URL and app secrets from Secrets Manager at process start"
```

---

### Task 3: Network and Data stacks

**Files:**
- Create: `infra/lib/network-stack.ts`, `infra/lib/data-stack.ts`, `infra/test/network-stack.test.ts`, `infra/test/data-stack.test.ts`
- Modify: `infra/bin/muxaris.ts`, `infra/package.json` (scripts `deploy:network`, `deploy:data`)

**Interfaces:**
- Produces: `NetworkStack { vpc: ec2.Vpc; albSg: ec2.SecurityGroup; serviceSg: ec2.SecurityGroup; lambdaSg: ec2.SecurityGroup; dbSg: ec2.SecurityGroup }`; `DataStack { db: rds.DatabaseInstance; dbSecret: secretsmanager.ISecret; appSecret: secretsmanager.ISecret; apiRepo: ecr.Repository; gatewayRepo: ecr.Repository }`; outputs `DbEndpoint`, `DbSecretArn`, `AppSecretArn`, `ApiRepoUri`, `GatewayRepoUri`.

- [ ] **Step 1: Failing tests** (pattern as `infra/test/storage-stack.test.ts`):

```ts
// infra/test/network-stack.test.ts
import { App } from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { describe, it } from "vitest";
import { ENV } from "../lib/config.js";
import { NetworkStack } from "../lib/network-stack.js";

describe("NetworkStack", () => {
  const t = Template.fromStack(new NetworkStack(new App(), "T", { env: ENV }));
  it("two AZs: public, private-with-egress (one NAT) and isolated subnets", () => {
    t.resourceCountIs("AWS::EC2::NatGateway", 1);
    t.resourceCountIs("AWS::EC2::Subnet", 6);
    t.hasResourceProperties("AWS::EC2::VPC", { CidrBlock: "10.42.0.0/16", EnableDnsHostnames: true });
  });
  it("db security group only accepts 5432 from the services and the lambdas", () => {
    const ingress = t.findResources("AWS::EC2::SecurityGroupIngress");
    const to5432 = Object.values(ingress).filter((r) => r.Properties.ToPort === 5432);
    if (to5432.length !== 2) throw new Error(`expected 2 ingress rules to 5432, got ${to5432.length}`);
    t.hasResourceProperties("AWS::EC2::SecurityGroup", { GroupDescription: Match.stringLikeRegexp("ALB") , SecurityGroupIngress: Match.arrayWith([Match.objectLike({ FromPort: 80 })]) });
  });
});
```

```ts
// infra/test/data-stack.test.ts
import { App } from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { describe, it } from "vitest";
import { ENV } from "../lib/config.js";
import { NetworkStack } from "../lib/network-stack.js";
import { DataStack } from "../lib/data-stack.js";

describe("DataStack", () => {
  const app = new App();
  const net = new NetworkStack(app, "N", { env: ENV });
  const t = Template.fromStack(new DataStack(app, "T", { env: ENV, network: net }));
  it("encrypted Postgres 16 t4g.micro in isolated subnets with a generated secret and 7-day backups", () => {
    t.hasResourceProperties("AWS::RDS::DBInstance", {
      Engine: "postgres",
      DBInstanceClass: "db.t4g.micro",
      StorageEncrypted: true,
      PubliclyAccessible: false,
      BackupRetentionPeriod: 7,
      DeletionProtection: true,
      AllocatedStorage: "20",
    });
    t.resourceCountIs("AWS::SecretsManager::Secret", 2);
  });
  it("app secret has no value in the template", () => {
    const s = JSON.stringify(t.toJSON());
    if (s.includes("SecretString")) throw new Error("template contains SecretString");
    t.hasResourceProperties("AWS::SecretsManager::Secret", { Name: "muxaris/app" });
  });
  it("two immutable ECR repositories with scan-on-push and a 10-image lifecycle", () => {
    t.resourceCountIs("AWS::ECR::Repository", 2);
    t.hasResourceProperties("AWS::ECR::Repository", {
      RepositoryName: "muxaris-api",
      ImageTagMutability: "IMMUTABLE",
      ImageScanningConfiguration: { ScanOnPush: true },
      LifecyclePolicy: { LifecyclePolicyText: Match.stringLikeRegexp("10") },
    });
  });
});
```

- [ ] **Step 2: Run** `npx vitest run infra` → fails. **Step 3: Implement.**

`infra/lib/network-stack.ts`:

```ts
import { Stack, type StackProps } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import type { Construct } from "constructs";

/** One VPC: public subnets for the ALB and Fargate tasks (public IPs, no NAT needed), private
 *  subnets with one NAT gateway for the Lambdas, isolated subnets for RDS. Ruling R1. */
export class NetworkStack extends Stack {
  readonly vpc: ec2.Vpc;
  readonly albSg: ec2.SecurityGroup;
  readonly serviceSg: ec2.SecurityGroup;
  readonly lambdaSg: ec2.SecurityGroup;
  readonly dbSg: ec2.SecurityGroup;
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);
    this.vpc = new ec2.Vpc(this, "Vpc", {
      vpcName: "muxaris",
      ipAddresses: ec2.IpAddresses.cidr("10.42.0.0/16"),
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: "private", subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
        { name: "isolated", subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });
    this.albSg = new ec2.SecurityGroup(this, "AlbSg", { vpc: this.vpc, description: "ALB: 80/443 from anywhere", allowAllOutbound: true });
    this.albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80));
    this.albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443));
    this.serviceSg = new ec2.SecurityGroup(this, "ServiceSg", { vpc: this.vpc, description: "Fargate services: from the ALB only", allowAllOutbound: true });
    this.serviceSg.addIngressRule(this.albSg, ec2.Port.tcp(4000));
    this.serviceSg.addIngressRule(this.albSg, ec2.Port.tcp(4100));
    this.lambdaSg = new ec2.SecurityGroup(this, "LambdaSg", { vpc: this.vpc, description: "Workers (Lambda)", allowAllOutbound: true });
    this.dbSg = new ec2.SecurityGroup(this, "DbSg", { vpc: this.vpc, description: "RDS: 5432 from services and lambdas", allowAllOutbound: false });
    this.dbSg.addIngressRule(this.serviceSg, ec2.Port.tcp(5432));
    this.dbSg.addIngressRule(this.lambdaSg, ec2.Port.tcp(5432));
  }
}
```

`infra/lib/data-stack.ts`:

```ts
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";
import type { NetworkStack } from "./network-stack.js";

export interface DataStackProps extends StackProps { network: NetworkStack }

/** RDS Postgres 16, the two secrets processes read at start (R3), and the ECR repositories (R7). */
export class DataStack extends Stack {
  readonly db: rds.DatabaseInstance;
  readonly dbSecret: secretsmanager.ISecret;
  readonly appSecret: secretsmanager.ISecret;
  readonly apiRepo: ecr.Repository;
  readonly gatewayRepo: ecr.Repository;
  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);
    const { vpc, dbSg } = props.network;
    this.db = new rds.DatabaseInstance(this, "Postgres", {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSg],
      credentials: rds.Credentials.fromGeneratedSecret("muxaris", { secretName: "muxaris/db" }),
      databaseName: "muxaris",
      allocatedStorage: 20,
      maxAllocatedStorage: 50,
      storageType: rds.StorageType.GP3,
      storageEncrypted: true,
      multiAz: false,
      publiclyAccessible: false,
      backupRetention: Duration.days(7),
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
      cloudwatchLogsExports: ["postgresql"],
      enablePerformanceInsights: false,
    });
    this.dbSecret = this.db.secret!;
    // Values are written by scripts/bootstrap-aws.sh --secrets, never by CDK.
    this.appSecret = new secretsmanager.Secret(this, "AppSecret", {
      secretName: "muxaris/app",
      description: "Muxaris app secrets as JSON key→value (Sarvam, Razorpay, WhatsApp)",
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const repo = (id: string, name: string) =>
      new ecr.Repository(this, id, {
        repositoryName: name,
        imageTagMutability: ecr.TagMutability.IMMUTABLE,
        imageScanOnPush: true,
        removalPolicy: RemovalPolicy.RETAIN,
        lifecycleRules: [{ description: "keep the last 10 images", maxImageCount: 10 }],
      });
    this.apiRepo = repo("ApiRepo", "muxaris-api");
    this.gatewayRepo = repo("GatewayRepo", "muxaris-voice-gateway");
    new CfnOutput(this, "DbEndpoint", { value: this.db.dbInstanceEndpointAddress });
    new CfnOutput(this, "DbSecretArn", { value: this.dbSecret.secretArn });
    new CfnOutput(this, "AppSecretArn", { value: this.appSecret.secretArn });
    new CfnOutput(this, "ApiRepoUri", { value: this.apiRepo.repositoryUri });
    new CfnOutput(this, "GatewayRepoUri", { value: this.gatewayRepo.repositoryUri });
  }
}
```

Note: `secretsmanager.Secret` with no `generateSecretString` generates a random password by default; that is fine as a placeholder because the bootstrap script overwrites it with the JSON. If CDK's default generation produces a string that `applySecretsToEnv` would reject, the resolver's "not valid JSON" error is the designed failure before bootstrap has run.

`infra/bin/muxaris.ts`: instantiate `const network = new NetworkStack(app, "MuxarisNetwork", { env: ENV, description: "Muxaris VPC, subnets and security groups" });` and `const data = new DataStack(app, "MuxarisData", { env: ENV, network, description: "Muxaris Postgres, secrets and container registries" });` after the existing stacks. `infra/package.json`: `"deploy:network": "bash scripts/cdk.sh deploy MuxarisNetwork --require-approval never"`, `"deploy:data": "bash scripts/cdk.sh deploy MuxarisData --require-approval never"`.

- [ ] **Step 4: Run** `npx vitest run infra` → pass; `npm run typecheck -w @muxaris/infra`. Do not deploy.

- [ ] **Step 5: Commit** `git commit -m "feat(infra): network (public/private/isolated, one NAT) and data (RDS 16, secrets, ECR) stacks"`

---

### Task 4: Workers stack

**Files:**
- Create: `infra/lib/workers-stack.ts`, `infra/test/workers-stack.test.ts`
- Modify: `infra/package.json` (devDependency `esbuild` `^0.25`, script `deploy:workers`), `infra/bin/muxaris.ts`, `packages/storage/src/queue.ts` (+ test) for `ChangeMessageVisibility`

**Interfaces:**
- Consumes: `StorageStack.queue`/`.bucket` (expose them as `readonly` fields if they are not already; check `infra/lib/storage-stack.ts`), `DataStack.dbSecret/appSecret`, `NetworkStack.vpc/lambdaSg`.
- Produces: `WorkersStack { postCallFn, sweepFn, deliverFn, remindersFn: lambda.Function; dlqAlarm: cloudwatch.Alarm }`.

- [ ] **Step 1: Failing tests** `infra/test/workers-stack.test.ts` — build App → Network → Storage → Data → Workers; assert:
  - `AWS::Lambda::Function` count 4, each `Runtime: "nodejs22.x"`, `Architectures: ["arm64"]`, `MemorySize` 1024 for post-call and 512 for the others, `Timeout` 300 for post-call (SQS visibility is 360 s), 120 for sweep and deliver, 120 for reminders; `VpcConfig` present with the lambda SG.
  - `AWS::Lambda::EventSourceMapping` with `BatchSize: 5`, `FunctionResponseTypes: ["ReportBatchItemFailures"]`, `MaximumBatchingWindowInSeconds: 5`.
  - Three `AWS::Events::Rule` with `ScheduleExpression` `rate(1 minute)` (deliver), `rate(15 minutes)` ×2 (reminders, sweep).
  - IAM: a policy statement with `bedrock:InvokeModel` whose `Resource` includes `arn:aws:bedrock:ap-south-1:005533348545:inference-profile/apac.amazon.nova-pro-v1:0` and `arn:aws:bedrock:*::foundation-model/amazon.nova-pro-v1:0`; a statement with `ses:SendEmail` and `ses:SendRawEmail`; `secretsmanager:GetSecretValue` on both secret ARNs; no `sns:Publish` unless the stack prop `smsEnabled` is true (test both constructions).
  - `AWS::CloudWatch::Alarm` on `ApproximateNumberOfMessagesVisible` of the DLQ, threshold 1, 1 period of 300 s.
  - No `SecretString` anywhere in the template; env vars `DB_SECRET_ARN`/`APP_SECRET_ARN` are `Ref`/`GetAtt`, `DATABASE_SSL` = `verify`, `NODE_ENV` = `production`, `AWS_REGION` not set (Lambda provides it), `POST_CALL_MODEL_ID` = `apac.amazon.nova-pro-v1:0`, `NOTIFY_PROVIDER` = `aws`, `NOTIFY_FROM_EMAIL` = prop `notifyFromEmail` (default `"appointments@muxaris.com"`; the real value comes from `.env` through the bin).

- [ ] **Step 2: Run** → fails. **Step 3: Implement** with `NodejsFunction` (`aws-cdk-lib/aws-lambda-nodejs`):

```ts
const fn = (id: string, entry: string, handler: string, memory: number, timeoutS: number) =>
  new nodejs.NodejsFunction(this, id, {
    entry, handler, runtime: lambda.Runtime.NODEJS_22_X, architecture: lambda.Architecture.ARM_64,
    memorySize: memory, timeout: Duration.seconds(timeoutS),
    vpc, vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }, securityGroups: [lambdaSg],
    logRetention: logs.RetentionDays.ONE_MONTH,
    bundling: {
      format: nodejs.OutputFormat.ESM, target: "node22", minify: false, sourceMap: true,
      externalModules: ["pg-native"],
      banner: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
      mainFields: ["module", "main"],
    },
    environment: { NODE_ENV: "production", DATABASE_SSL: "verify", DB_SECRET_ARN: dbSecret.secretArn, APP_SECRET_ARN: appSecret.secretArn, ...extra },
  });
```

Entries: `workers/post-call/src/lambda.ts` (`handler`, `sweepHandler`) and `workers/notifier/src/lambda.ts` (`deliverHandler`, `remindersHandler`); resolve the entry path from `infra/` with `fileURLToPath(new URL("../../workers/post-call/src/lambda.ts", import.meta.url))`. `projectRoot` = repo root and `depsLockFilePath` = root `package-lock.json` so esbuild resolves workspace packages from source (the bundle includes `@muxaris/*` source through their `dist`? No: esbuild resolves `@muxaris/core` via its `package.json` `exports` → `dist/index.js`, so **`npm run build:packages` must run before `cdk synth`**; say so in `infra/scripts/cdk.sh` by running it first when `dist` is missing — add `[[ -d "$ROOT/packages/core/dist" ]] || (cd "$ROOT" && npm run build:packages)`). Queue event source: `new SqsEventSource(queue, { batchSize: 5, maxBatchingWindow: Duration.seconds(5), reportBatchItemFailures: true })`. Schedules: `events.Rule` with `events.Schedule.rate(...)` and `targets.LambdaFunction`. Grants: `dbSecret.grantRead(fn)`, `appSecret.grantRead(fn)`, `queue.grantConsumeMessages(postCallFn)` (covers ChangeMessageVisibility), `bucket.grantRead(postCallFn)` (it reads the transcript), explicit `PolicyStatement` for Bedrock (both ARNs above; the foundation-model ARN uses region `*`), SES statement scoped to `arn:aws:ses:ap-south-1:005533348545:identity/muxaris.com`, and `sns:Publish` on `*` only when `props.smsEnabled`. DLQ alarm: `queue`'s DLQ is created in the Storage stack; expose it (`readonly dlq`) and alarm on `dlq.metricApproximateNumberOfMessagesVisible({ period: Duration.minutes(5) })` ≥ 1; `alarm.addAlarmAction(new SnsAction(topic))` where `topic` is passed in from the Observability stack later (for now accept an optional `alarmTopic?: sns.ITopic` prop and only wire the action when given; Task 6 passes it).

`packages/storage/src/queue.ts`: add `extendVisibility(handle: string, seconds: number)` using `ChangeMessageVisibilityCommand`; the post-call worker calls it before the Bedrock request when the message has already been in flight for more than half the visibility window (read `ApproximateReceiveCount`/timing as available; if the current `JobQueue` abstraction does not expose the receipt timing, implement the method and the unit test only, and leave the call site for a documented follow-up — say which in the report). Unit test with the existing fake SQS pattern in `packages/storage`.

- [ ] **Step 4: Run** `npx vitest run infra packages/storage` → pass. Run `npm run synth -w @muxaris/infra` (this sources the guard: it calls `aws sts get-caller-identity` only; allowed) → synth succeeds and bundles the four functions. Then `grep -rl SecretString infra/cdk.out/*.template.json` → no output.

- [ ] **Step 5: Commit** `git commit -m "feat(infra): workers stack — four Lambdas in the VPC, SQS partial-batch mapping, schedules, IAM, DLQ alarm"`

---

### Task 5: Services stack (ALB, ECS, Fargate, migrate task)

**Files:**
- Create: `infra/lib/services-stack.ts`, `infra/test/services-stack.test.ts`
- Modify: `infra/bin/muxaris.ts`, `infra/package.json` (`deploy:services`), `infra/lib/config.ts` (`API_HOST = "api.muxaris.com"`, `VOICE_HOST = "voice.muxaris.com"`)

**Interfaces:**
- Consumes: `NetworkStack`, `DataStack` (repos, secrets), `StorageStack.bucket/queue`.
- Produces: `ServicesStack { alb: elbv2.ApplicationLoadBalancer; cluster: ecs.Cluster; apiService, gatewayService: ecs.FargateService; migrateTaskDef: ecs.FargateTaskDefinition }`; outputs `AlbDnsName`, `ClusterName`, `MigrateTaskDefinitionArn`, `ApiServiceName`, `GatewayServiceName`, `PublicSubnetIds`, `ServiceSecurityGroupId`. Props: `imageTag: string` (from `IMAGE_TAG` env, default `latest`), `certArn?: string` (from `CERT_ARN`), `corsOrigins: string` (joined `WEB_ORIGINS`), `maxSessions`, `maxCallSeconds`, `notifyFromEmail`, `billingEnabled: boolean`.

- [ ] **Step 1: Failing tests** — assert:
  - `AWS::ElasticLoadBalancingV2::LoadBalancer` with `LoadBalancerAttributes` containing `idle_timeout.timeout_seconds` = `"3600"`; scheme `internet-facing`; in public subnets.
  - Without `certArn`: exactly one listener on 80 forwarding to the API target group; a listener rule with host header `voice.muxaris.com` → gateway target group; a rule with path patterns `/v1/session*`, `/v1/telephony/*` → gateway. With `certArn`: a 443 listener using the cert, the same rules on 443, and the 80 listener is a `redirect` to HTTPS 443.
  - Both target groups: `HealthCheckPath: "/healthz"`, `Protocol: "HTTP"`, `TargetType: "ip"`, deregistration delay 30 s.
  - Two `AWS::ECS::Service` with `LaunchType: FARGATE`, `DesiredCount: 1`, `NetworkConfiguration` with `AssignPublicIp: ENABLED` (public subnets, no NAT); the API service has an `AWS::ApplicationAutoScaling::ScalableTarget` min 1 max 2 with a CPU target policy at 70; the gateway service has none (R4). `DeploymentConfiguration` min 100 / max 200 for the API and min 0 / max 100 for the gateway (one task, no double-run) — document.
  - Three `AWS::ECS::TaskDefinition`: api, gateway, migrate; `RuntimePlatform: { CpuArchitecture: ARM64, OperatingSystemFamily: LINUX }`, `Cpu: "512"`, `Memory: "1024"` (migrate 256/512); container `StopTimeout: 90` on the gateway (Review Focus 3) and 30 on the API; images are `<repoUri>:<imageTag>`; log configuration `awslogs` with groups `/muxaris/api`, `/muxaris/voice-gateway`, `/muxaris/migrate` and retention one month.
  - Environment (no secrets): API `NODE_ENV=production`, `AUTH_MODE=cognito`, `COGNITO_USER_POOL_ID`/`COGNITO_CLIENT_ID` from props (read from `.env` in the bin), `CORS_ORIGINS`, `CALLS_BUCKET`, `AWS_REGION=ap-south-1`, `TRUST_PROXY=1`, `DATABASE_SSL=verify`, `DB_SECRET_ARN`, `APP_SECRET_ARN`, `GIT_SHA=<imageTag>`, `BILLING_ENABLED` = `1`/unset; gateway adds `VOICE_PROVIDER=sarvam`, `BEDROCK_MODEL_ID=global.amazon.nova-2-lite-v1:0`, `MAX_SESSIONS`, `MAX_CALL_SECONDS`, `POST_CALL_QUEUE_URL`, `CORS_ORIGINS` = the web origins (the WebSocket origin allow-list); migrate task = API image with `command: ["node", "packages/db/dist/migrate.js"]` and the same DB env. A test that `JSON.stringify(template)` contains neither `SecretString` nor the literal `rzp_` nor `sk-`.
  - IAM (ARCHITECTURE "Phase 5 IAM"): API task role `s3:GetObject` + `s3:ListBucket` on the calls bucket and `secretsmanager:GetSecretValue` on both secrets; gateway task role `s3:PutObject` on the bucket, `sqs:SendMessage` on the queue, `bedrock:InvokeModelWithResponseStream` + `bedrock:InvokeModel` on `arn:aws:bedrock:*::foundation-model/amazon.nova-2-lite-v1:0` and `arn:aws:bedrock:ap-south-1:005533348545:inference-profile/global.amazon.nova-2-lite-v1:0`, secrets read; migrate task role: secrets read only. Execution roles: ECR pull + logs (default `AmazonECSTaskExecutionRolePolicy` via `ecs.TaskDefinition` defaults).

- [ ] **Step 2: Run** → fails. **Step 3: Implement** with `ecs.Cluster` (`containerInsights: true`), `ecs.FargateTaskDefinition`, `ecs.ContainerImage.fromEcrRepository(repo, imageTag)`, `ecs.FargateService` (`assignPublicIp: true`, `vpcSubnets: PUBLIC`, `securityGroups: [serviceSg]`, `circuitBreaker: { rollback: true }`, `enableExecuteCommand: false`, `healthCheckGracePeriod: Duration.seconds(60)`), `elbv2.ApplicationLoadBalancer` (`internetFacing: true`, `idleTimeout: Duration.seconds(3600)`, `securityGroup: albSg`), `addListener` + `addTargets`/`ApplicationTargetGroup`, `ListenerCondition.hostHeaders([VOICE_HOST])`, `ListenerCondition.pathPatterns(["/v1/session*", "/v1/telephony/*"])`, `elbv2.ListenerAction.redirect({ protocol: "HTTPS", port: "443", permanent: true })` when `certArn`. `logs.LogGroup` ×3 with `RetentionDays.ONE_MONTH` and `RemovalPolicy.DESTROY`. Autoscaling: `apiService.autoScaleTaskCount({ minCapacity: 1, maxCapacity: 2 }).scaleOnCpuUtilization("Cpu", { targetUtilizationPercent: 70 })`.

Bin: read `IMAGE_TAG`, `CERT_ARN`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `MAX_SESSIONS`, `MAX_CALL_SECONDS`, `NOTIFY_FROM_EMAIL`, `BILLING_ENABLED` from `process.env` (populated by `cdk.sh` from `.env`); refuse to synth `MuxarisServices` when the Cognito ids are empty (throw with the key names).

- [ ] **Step 4: Run** tests + `npm run synth -w @muxaris/infra` → pass; `grep` check as in Task 4.

- [ ] **Step 5: Commit** `git commit -m "feat(infra): services stack — ALB with host and path rules, two ARM Fargate services, migrate task, IAM"`

---

### Task 6: Observability and CI/CD stacks, GitHub workflows

**Files:**
- Create: `infra/lib/observability-stack.ts`, `infra/lib/cicd-stack.ts`, `infra/test/observability-stack.test.ts`, `infra/test/cicd-stack.test.ts`, `.github/workflows/ci.yml`, `.github/workflows/deploy-aws.yml`
- Modify: `infra/bin/muxaris.ts`, `infra/package.json` (`deploy:observability`, `deploy:cicd`, `deploy:all`)

**Interfaces:**
- Consumes: `ServicesStack` (alb, services, log groups), `WorkersStack` (functions, dlq alarm hook), `DataStack.db`.
- Produces: `ObservabilityStack { topic: sns.Topic; dashboard: cloudwatch.Dashboard }` (output `AlarmTopicArn`, `DashboardUrl`); `CicdStack` (output `DeployRoleArn`). Props: `alarmEmail?: string` (from `ALARM_EMAIL`), `githubRepo: "suhasTeju/muxaris-site"`.

- [ ] **Step 1: Failing tests.** Observability: `AWS::SNS::Topic` + one `AWS::SNS::Subscription` (email) when `alarmEmail` is set, none otherwise; metric filters on `/muxaris/voice-gateway` for the JSON `turn` line: `{ $.msg = "turn" }` with metric values `$.sttMs`, `$.llmFirstTokenMs`, `$.ttsFirstAudioMs` (namespace `Muxaris`, names `SttMs`, `LlmFirstTokenMs`, `TtsFirstAudioMs`) and a count filter `{ $.msg = "session accepted" }` → `CallsStarted`; a `CallsSettled` filter on `{ $.msg = "call settled" }`; alarms: ALB `HTTPCode_Target_5XX_Count` ≥ 5 in 5 min, gateway service `CPUUtilization` ≥ 85 for 2 periods, each Lambda `Errors` ≥ 1, RDS `CPUUtilization` ≥ 80, RDS `FreeStorageSpace` < 2 GB, DLQ depth (from Workers), each with the SNS action; a `AWS::CloudWatch::Dashboard` whose body (string) mentions `CallsStarted`, `SttMs` and `HTTPCode_Target_5XX_Count`. Cicd: `AWS::IAM::OIDCProvider` for `https://token.actions.githubusercontent.com` with audience `sts.amazonaws.com`; a role `MuxarisGithubDeploy` whose trust policy condition is `token.actions.githubusercontent.com:sub` = `repo:suhasTeju/muxaris-site:ref:refs/heads/main`; permissions: `ecr:GetAuthorizationToken` on `*`, push/pull on both repos, `sts:AssumeRole` on `arn:aws:iam::005533348545:role/cdk-hnb659fds-*-005533348545-ap-south-1` (the CDK bootstrap roles), `ecs:RunTask`/`ecs:DescribeTasks` on the cluster + `iam:PassRole` on the migrate task/execution roles, `logs:GetLogEvents` on the migrate log group.

- [ ] **Step 2: Run** → fails. **Step 3: Implement** both stacks (standard constructs; use `logs.MetricFilter`, `cloudwatch.Alarm`, `cloudwatch.Dashboard` with `GraphWidget`s for calls/min, the three latency metrics p50/p95 (`statistic: "p50"` / `"p95"`), ALB 5xx and request count, service CPU/memory, Lambda errors/duration, RDS CPU/connections/free storage; `iam.OpenIdConnectProvider`, `iam.Role` with `iam.WebIdentityPrincipal` and `StringEquals`/`StringLike` conditions). Wire the Workers DLQ alarm action by passing `observability.topic` into Workers (so Observability is instantiated before Workers in the bin, or Workers exposes the alarm and Observability adds the action — pick the second: Observability receives `workers.dlqAlarm` and calls `addAlarmAction`).

- [ ] **Step 4: Workflows.** `.github/workflows/ci.yml`:

```yaml
name: ci
on:
  pull_request:
  push:
    branches: [main, "feat/**"]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env: { POSTGRES_USER: muxaris, POSTGRES_PASSWORD: muxaris, POSTGRES_DB: muxaris }
        ports: ["5433:5432"]
        options: >-
          --health-cmd "pg_isready -U muxaris" --health-interval 5s --health-timeout 5s --health-retries 10
    env:
      DATABASE_URL: postgres://muxaris:muxaris@localhost:5433/muxaris
      CDK_DEFAULT_ACCOUNT: "005533348545"
      CDK_DEFAULT_REGION: ap-south-1
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - run: npm run build:packages
      - run: npm run migrate -w @muxaris/db
      - run: npm run typecheck
      - run: npm run lint
      - run: npx prettier --check .
      - run: npm test
      - name: DB-backed tests really ran
        run: npx vitest run packages/db/src/plans.test.ts --reporter=verbose 2>&1 | tee /tmp/plans.log; grep -q "skipped" /tmp/plans.log && exit 1 || true
```

`.github/workflows/deploy-aws.yml` (on `push: branches: [main]`, `permissions: { id-token: write, contents: read }`): checkout, setup-node, `npm ci`, `npm run build:packages`, `aws-actions/configure-aws-credentials@v4` with `role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}`, `aws-region: ap-south-1`; ECR login (`aws-actions/amazon-ecr-login@v2`); `docker buildx` build+push both images for `linux/arm64` tagged `${{ github.sha }}` (short) to the two repos; `npm run cdk -w @muxaris/infra -- deploy MuxarisData MuxarisWorkers MuxarisServices MuxarisObservability --require-approval never` with `IMAGE_TAG`, `CERT_ARN`, Cognito ids and the rest from `vars.*`/`secrets.*` (names only in the file; list the needed repository variables in a comment at the top: `AWS_DEPLOY_ROLE_ARN`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `CERT_ARN`, `NOTIFY_FROM_EMAIL`, `ALARM_EMAIL`, `BILLING_ENABLED`); then `bash scripts/migrate.sh` and `bash scripts/smoke.sh "$ALB_URL"` (Task 7). Because `infra/scripts/cdk.sh` sources `aws-guard.sh`, which expects a profile, make the guard accept an already-assumed role: in `scripts/lib/aws-guard.sh`, only export `AWS_PROFILE` when `AWS_PROFILE` is unset AND no `AWS_ACCESS_KEY_ID`/`AWS_WEB_IDENTITY_TOKEN_FILE` is present; the account check stays mandatory. Add a shell test `scripts/lib/aws-guard.test.sh` is not needed; instead a vitest in `infra/test/guard.test.ts` that runs `bash -n` on the guard and greps for the account id.

State in the task report and the plan: **these workflows cannot be verified to run in this phase** — the branch has never been pushed and `main` has only the Astro site. `act` is not installed. Verify YAML with `npx yaml-lint` is not available either; use `node -e "require('js-yaml')"`? No: use `python3 -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))" .github/workflows/ci.yml` (python3 + PyYAML present on macOS? check; if not, `npx --yes yaml-lint` is acceptable since it is a dev tool, not a secret-bearing call).

- [ ] **Step 5: Run** `npx vitest run infra`, synth, grep check. **Step 6: Commit** `git commit -m "feat(infra): observability (metric filters, dashboard, alarms → SNS) and GitHub OIDC deploy role; CI and deploy workflows"`

---

### Task 7: Operational scripts

**Files:**
- Create: `scripts/push-images.sh`, `scripts/migrate.sh`, `scripts/smoke.sh`, `scripts/request-cert.sh`
- Modify: `scripts/bootstrap-aws.sh` (`--secrets`, `--outputs` modes), `scripts/lib/aws-guard.sh` (Task 6's change if not done there), `infra/package.json` (`deploy:all` order), `README.md` (Scripts table rows only; the prose comes in Task 10)

- [ ] **Step 1: `scripts/push-images.sh`**: guard; `TAG=${1:-$(git rev-parse --short HEAD)}`; `aws ecr get-login-password | docker login --username AWS --password-stdin 005533348545.dkr.ecr.ap-south-1.amazonaws.com`; `bash scripts/build-images.sh "$TAG"`; tag + push both to `…/muxaris-api:$TAG` and `…/muxaris-voice-gateway:$TAG` (immutable tags: pushing an existing tag fails — print a clear message); print `IMAGE_TAG=$TAG`.
- [ ] **Step 2: `scripts/migrate.sh`**: guard; read `ClusterName`, `MigrateTaskDefinitionArn`, `PublicSubnetIds`, `ServiceSecurityGroupId` from `aws cloudformation describe-stacks --stack-name MuxarisServices` outputs; `aws ecs run-task --launch-type FARGATE --network-configuration "awsvpcConfiguration={subnets=[…],securityGroups=[…],assignPublicIp=ENABLED}"`; `aws ecs wait tasks-stopped`; read the container exit code (`describe-tasks`), print the last 50 log lines from `/muxaris/migrate` (`aws logs tail --since 10m`), exit non-zero on failure.
- [ ] **Step 3: `scripts/smoke.sh <base-url> [voice-ws-url]`** (R6): `curl -fsS $BASE/healthz` must return `"service":"api"`; `curl -fsS $BASE/v1/session` is not the gateway health — gateway health goes through the path rule? No: `/healthz` on the ALB default host is the API. So the gateway check uses the WebSocket upgrade: `curl -s -o /dev/null -w '%{http_code}' -H "Origin: https://evil.example" -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: $(openssl rand -base64 16)" "$BASE/v1/session"` → expect `403` (the gateway answered: the origin check ran). `curl -s -o /dev/null -w '%{http_code}' "$BASE/v1/me"` → `401`. If `SMOKE_TOKEN` is set: `curl -fsS -H "Authorization: Bearer $SMOKE_TOKEN" "$BASE/v1/me"` → 200 (never echo the token). Print one line per check and a final `smoke OK`.
- [ ] **Step 4: `scripts/request-cert.sh`**: guard; `aws acm request-certificate --domain-name api.muxaris.com --subject-alternative-names voice.muxaris.com --validation-method DNS --idempotency-token muxaris-services --region ap-south-1`; poll `describe-certificate` until `ResourceRecord`s exist; print the CNAME names/values to add at GoDaddy and the line `CERT_ARN=<arn>` to put in `.env`; exit 0 (validation happens later; `deploy:services` with `CERT_ARN` set adds HTTPS once ACM reports `ISSUED` — the script also prints the current status).
- [ ] **Step 5: `scripts/bootstrap-aws.sh`**: add `--secrets` (upsert `muxaris/app` from `.env` keys `SARVAM_TTS_API_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_PLAN_ID_STANDARD`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, including only the ones set, via `jq -n` from env, never echoing; print the key names written) and `--outputs` (print `DB_SECRET_ARN`, `APP_SECRET_ARN`, `AlbDnsName`, `DeployRoleArn`, `DashboardUrl` from stack outputs as `KEY=value` lines for `.env`/GitHub variables). Keep the default mode (bootstrap + Auth) unchanged.
- [ ] **Step 6: `infra/package.json`**: `"deploy:all": "bash scripts/cdk.sh deploy MuxarisNetwork MuxarisData MuxarisWorkers MuxarisServices MuxarisObservability MuxarisCicd --require-approval never"`.
- [ ] **Step 7: Tests**: `bash -n` every new script; `shellcheck` if installed (`command -v shellcheck`), otherwise skip and say so; a vitest `scripts/scripts.test.ts`? No — put `infra/test/scripts.test.ts` that spawns `bash -n` on each script and asserts exit 0, and asserts each AWS-touching script contains `aws-guard.sh` within its first 15 lines.
- [ ] **Step 8: Commit** `git commit -m "feat(scripts): push images, migrate via ECS run-task, smoke, ACM request, bootstrap --secrets/--outputs"`

---

### Task 8: Deploy, migrate, smoke (the first billable step)

This task runs real AWS commands through the guard. Cost as stated in Global Constraints (~US$100–115/month). It is done by the controller or a Sonnet agent explicitly allowed to run `aws`/`cdk` via the guard scripts, in this order, stopping at the first failure and reporting it:

- [ ] **Step 1:** `bash scripts/bootstrap-aws.sh --secrets` (writes `muxaris/app`; prints key names only). If `muxaris/app` does not exist yet, deploy `MuxarisData` first (it creates the placeholder) — so the real order is: `npm run deploy:network -w @muxaris/infra`, `npm run deploy:data -w @muxaris/infra`, then `--secrets`.
- [ ] **Step 2:** `bash scripts/push-images.sh` → note `IMAGE_TAG`; put `IMAGE_TAG`, `DB_SECRET_ARN`, `APP_SECRET_ARN` into `.env` (from `bootstrap-aws.sh --outputs`).
- [ ] **Step 3:** `npm run deploy:workers -w @muxaris/infra`, `npm run deploy:services -w @muxaris/infra` (HTTP only; `CERT_ARN` unset), `npm run deploy:observability -w @muxaris/infra` (with `ALARM_EMAIL` set in `.env` if the user provided one; otherwise no subscription), `npm run deploy:cicd -w @muxaris/infra`.
- [ ] **Step 4:** `bash scripts/migrate.sh` → "migrations applied" in the log tail; verify with a one-off query? Not possible without DB access from outside; rely on the migrate exit code and the API `/healthz`.
- [ ] **Step 5:** `bash scripts/smoke.sh http://<AlbDnsName>` → `smoke OK`.
- [ ] **Step 6:** `bash scripts/request-cert.sh` → record the CNAMEs (public data) in the report for the user.
- [ ] **Step 7:** `grep` the synthesized templates in `infra/cdk.out` for every value in `.env` (script: for each non-empty value, `grep -rqF -- "$value" infra/cdk.out && echo "LEAK $key"`; values never printed) → no `LEAK` lines. Record the check in the report.
- [ ] **Step 8:** Report: stack names and status, ALB DNS name, dashboard URL, deploy role ARN, the three ACM CNAMEs, the image tag, the migrate log tail (no secrets), the smoke output, the first-month cost estimate. Nothing is committed in this task except `.env.example` comments if any were missing (the `.env` itself is never committed).

---

### Task 9: Twilio media-stream transport, telephony webhook, Exotel stub

**Files:**
- Create: `apps/voice-gateway/src/telephony/mulaw.ts` (+ `.test.ts`), `apps/voice-gateway/src/telephony/resample.ts` (+ `.test.ts`), `apps/voice-gateway/src/telephony/twilio-transport.ts` (+ `.test.ts`), `apps/voice-gateway/src/telephony/stream-token.ts` (+ `.test.ts`), `apps/voice-gateway/src/telephony/exotel-transport.ts`, `apps/api/src/routes/telephony.ts` (+ `.test.ts`), `packages/core/src/services/phone-numbers.ts` (+ `.test.ts`), `packages/db/src/schema/telephony.ts`, `packages/db/drizzle/0007_phone_numbers.sql` (+ meta via `drizzle-kit generate --name=phone_numbers`), `docs/TELEPHONY.md`
- Modify: `apps/voice-gateway/src/env.ts` (`telephony: { provider: "none" | "twilio" | "exotel"; streamSecret: string | null }` from `TELEPHONY_PROVIDER`, `TELEPHONY_STREAM_SECRET`), `apps/voice-gateway/src/server.ts` (accept `/v1/telephony/twilio` upgrades when enabled; extract the accept logic shared with browser sessions), `apps/api/src/env.ts` + `app.ts` (`TWILIO_AUTH_TOKEN`, `TELEPHONY_STREAM_SECRET`, `VOICE_WSS_URL`; mount the public telephony route with `bodyLimit` 16 KB), `packages/db/src/schema/index.ts`, `packages/shared/src/api.ts` (`PhoneNumber` DTO) , `.env.example`

**Interfaces:**
- `mulawDecode(u8: Uint8Array): Int16Array`, `mulawEncode(pcm: Int16Array): Uint8Array` (G.711 μ-law, standard tables; test: encode(decode(x)) round-trips the 256 codes; decode(0xFF) = 0; decode(0x7F) = -8031 → check against the canonical table values in the test).
- `upsample8kTo16k(pcm8: Int16Array): Int16Array` (linear interpolation, length ×2), `downsample24kTo8k(pcm24: Int16Array): Int16Array` (average each 3 samples; length ÷3; a 3-sample tail is dropped only if incomplete — test lengths and a DC signal).
- `signStreamToken(secret, { callSid, clinicId, exp }): string` / `verifyStreamToken(secret, token, now): { callSid, clinicId } | null` (HMAC-SHA256 over `callSid.clinicId.exp`, base64url `payload.sig`, `timingSafeEqual`; expired or tampered → null).
- `TwilioMediaStreamTransport implements MediaTransport` over a `ws` socket: handles `connected`, `start` (reads `streamSid`, `customParameters.token`), `media` (base64 μ-law 8 kHz → decode → upsample → `onInboundAudio`), `stop`; `sendAudio(pcm24k)` → downsample → encode → base64 chunks of 160 bytes (20 ms) as `{ event: "media", streamSid, media: { payload } }`; `sendEvent` → only `flush_playback` maps to `{ event: "clear", streamSid }` (other gateway events are dropped — nothing to render on a phone); `close()` sends nothing further and closes the socket. Exposes `onceStarted(): Promise<{ callSid, token, from?, to? }>` so the server can verify before creating the call.
- `findClinicByPhoneNumber(db, e164): Promise<{ clinicId: string; language: string } | null>`; `phone_numbers` table: `id` (`pn_` prefix via `IdPrefix` — add `"pn"`), `clinic_id` FK cascade, `e164` text unique, `provider` text (`twilio`|`exotel`), `created_at`.
- API route `POST /webhooks/telephony/twilio` (public, form-encoded `From`, `To`, `CallSid`): verify `X-Twilio-Signature` (HMAC-SHA1 of the full URL + sorted POST params, base64; Twilio's documented algorithm; compare with `timingSafeEqual`) → 403 on mismatch BEFORE any DB access; look up the clinic by `To` → unknown number: TwiML `<Say>` "This number is not configured." then `<Hangup/>` (200); known: mint a stream token (5 min) and answer TwiML `<Response><Connect><Stream url="wss://voice.muxaris.com/v1/telephony/twilio"><Parameter name="token" value="…"/></Stream></Connect></Response>` with `Content-Type: text/xml`. Log only `{ callSid, clinicId }` — never `From`/`To`.
- Gateway: on upgrade to `/v1/telephony/twilio` when `env.telephony.provider === "twilio"`: construct the transport, await `onceStarted()` (5 s timeout → 4001), `verifyStreamToken` (invalid → close 4001 before any DB write), load the clinic context, run the same plan/concurrency checks as the browser path (refactor `handleStart` so the checks live in `acceptSession({ clinicId, language, channel, callerPhone, callerIdentity })` used by both paths), `createCall` with `channel: "phone"` and `callerPhone` = Twilio `From` (if the transport received it in `start.customParameters` — pass `From` as a second `<Parameter name="from">` from the webhook; stored on the call row exactly as Phase 2 stores `callerPhone`, masked wherever it is listed).
- Exotel: `exotel-transport.ts` exports a class whose constructor throws `new Error("Exotel transport is not implemented; see docs/TELEPHONY.md")` and `docs/TELEPHONY.md` documents the Twilio setup (buy a number, point the voice webhook at `https://api.muxaris.com/webhooks/telephony/twilio`, set `TWILIO_AUTH_TOKEN`, `TELEPHONY_PROVIDER=twilio`, `TELEPHONY_STREAM_SECRET`, insert the `phone_numbers` row) and the Exotel steps (Exotel "Voicebot Applet" streams 8 kHz PCM over WebSocket with its own JSON envelope; list the mapping to `MediaTransport` and the unknowns to verify: codec, envelope, auth).

- [ ] **Steps:** TDD each module in the order listed (codec → resample → token → transport with a fake `ws` → core lookup with Postgres → API route with a signed fixture → gateway accept path reusing `server.test.ts` fakes: a scripted phone session that books a slot through the existing fake STT/LLM/TTS, asserting `channel: "phone"` on the call row and that a bad token never creates a call). Migration 0007 via `npx drizzle-kit generate --name=phone_numbers`. `.env.example` block:

```
# Telephony (off unless TELEPHONY_PROVIDER=twilio). The API verifies Twilio's signature with the
# auth token and mints a 5-minute stream token the gateway verifies before accepting a call.
TELEPHONY_PROVIDER=
TWILIO_AUTH_TOKEN=
TELEPHONY_STREAM_SECRET=
VOICE_WSS_URL=wss://voice.muxaris.com
```

- [ ] **Gate** (`npx vitest run packages/core packages/db apps/api apps/voice-gateway`), commit `git commit -m "feat(telephony): Twilio media-stream transport (μ-law 8k ↔ PCM16), signed telephony webhook, phone number → clinic, Exotel stub"`

---

### Task 10: Docs, README, env, carry-overs

**Files:**
- Create: `docs/AWS-SERVICES.md`, `docs/RUNBOOK.md`
- Modify: `README.md` (AWS and Deploy sections rewritten; Scripts table complete; Docs list), `docs/ARCHITECTURE.md` (new "Deployed topology" section after the call pipeline; close or re-point the Phase 2 carry-overs in "Operations notes" and "Phase 5 IAM"; known limits: one gateway task, Lambda via NAT, DLT for SMS, browser 20-minute cap), `.env.example` (add `VOICE_PROVIDER`, `NODE_ENV`, `IMAGE_TAG`, `CERT_ARN`, `ALARM_EMAIL`), `netlify.toml` (comment only: the two URLs the site needs), `apps/web/src/lib/copy-guard.test.ts` (re-run)

- [ ] **`docs/AWS-SERVICES.md`** — one table: service → role in Muxaris → why this service (for the credits application): Cognito, ECS Fargate (ARM), ECR, ALB, VPC + NAT, RDS Postgres, S3, SQS (+DLQ), Lambda, EventBridge, Bedrock (Nova 2 Lite, Nova Pro via APAC inference profile), SES, SNS (SMS, flagged; alarms), Secrets Manager, CloudWatch (logs, metric filters, dashboard, alarms), IAM OIDC for GitHub, ACM, CDK/CloudFormation. Then "Monthly cost estimate" (the table from Global Constraints) and "Cheaper alternatives considered" (R1 fallback).
- [ ] **`docs/RUNBOOK.md`** — Deploy from scratch (bootstrap → network → data → secrets → images → workers → services → observability → cicd → migrate → smoke → cert → DNS → services again with `CERT_ARN` → Netlify env), Deploy a change (push to `main` runs `deploy-aws.yml`; manual equivalent), Rotate a secret (`bootstrap-aws.sh --secrets` then force a new deployment: `aws ecs update-service --force-new-deployment`), Roll back (`IMAGE_TAG=<previous> npm run deploy:services`), Read logs (`aws logs tail /muxaris/voice-gateway --follow`), Alarms (what each means and the first thing to check), DLQ redrive, Database (connect through an ECS one-off `psql`? not shipped — document `aws rds` snapshot/restore and that there is no bastion), Scale the gateway (why it is one task; what a shared counter store needs), Domain/cert steps, Twilio go-live steps (link to TELEPHONY.md).
- [ ] **README**: replace the two-line AWS stub with the deployed topology summary and the deploy quick-start; list the GitHub repository variables; the Scripts table gets every script; "Known limits" list from the spec. Keep the local-setup sections intact.
- [ ] **ARCHITECTURE**: "Deployed topology" (ALB → services, subnets, where each process reads secrets, log groups, metric names), update "Phase 5 IAM" to "IAM (deployed)" reflecting what the stacks grant, and strike the carry-overs now done (sweep on EventBridge, ReportBatchItemFailures, stopTimeout) while keeping the RDS encryption statement accurate (`storageEncrypted: true`, TLS verified against the RDS CA bundle).
- [ ] **Gate** (`npx vitest run apps/web/src/lib && npm run typecheck && npm run lint && npx prettier --check .`), commit `git commit -m "docs: AWS services inventory, runbook, deployed topology, README deploy guide, env complete"`

---

## Self-review notes (controller)

- Spec coverage: CDK stacks (T3–T6), bootstrap script (T7), GitHub OIDC deploy (T6), dashboard + alarms (T6), smoke tests on the live ALB (T7, T8), custom domains after DNS (R5, T7 `request-cert.sh`, RUNBOOK), Twilio transport + webhook with μ-law transcoding activated by env (T9), Exotel stub with steps (T9), ARCHITECTURE/AWS-SERVICES/RUNBOOK/README/.env.example (T10). Migrations as an ECS one-off task via `scripts/migrate.sh` (T5, T7). ALB idle timeout 3600 (T5). CloudFront is not used: the ALB default hostname serves HTTP until the cert is validated (R5) — a deviation from the spec's "ALB/CloudFront URL", ruled because CloudFront in front of WebSockets adds cost and config for a temporary state.
- Spec deviations ruled: no Cognito Lambda triggers or custom SES email for Cognito (Auth stack unchanged; out of Phase 5 scope as written in the spec's Phase 5 list); the reminders worker lives inside the notifier (fact 3), so "3 Lambdas" became 4 functions over 2 workers; SNS SMS stays flagged.
- Type consistency: `applySecretsToEnv`, `sslFromEnv`, `NetworkStack`/`DataStack`/`WorkersStack`/`ServicesStack`/`ObservabilityStack`/`CicdStack` names and fields, `MediaTransport` methods, `verifyStreamToken`, `findClinicByPhoneNumber`, `IdPrefix "pn"`, `channel: "phone"` are used identically across tasks.
- Review Focus → tests: 1 → T1 `test-fresh-db.sh` + `ssl.test.ts`; 2 → T3/T4 subnet assertions; 3 → T5 `StopTimeout: 90`; 4 → T4/T5/T6 `SecretString` checks + T8 grep; 5 → T9 signature and token tests.
- Known plan risks for implementers to report rather than guess: `NodejsFunction` bundling of workspace packages (`exports` → `dist`) and the `pg` ESM `require` shim; whether `secretsmanager.Secret` without `generateSecretString` is accepted by CDK (if not, use `generateSecretString: { secretStringTemplate: "{}", generateStringKey: "placeholder" }` — the resolver ignores unknown keys); ECS circuit breaker + `minHealthyPercent: 0` on the gateway; `aws-guard.sh` behaviour under OIDC credentials; Twilio's signature algorithm details (URL must be the exact public URL including scheme and host as Twilio sees it — behind the ALB this is `https://api.muxaris.com/webhooks/telephony/twilio`; compute it from `VOICE_WSS_URL`'s sibling `PUBLIC_API_URL` env, add it to `.env.example`).
