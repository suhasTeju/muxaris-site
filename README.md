# Muxaris

Muxaris is an AI voice receptionist for Indian dental clinics. It answers calls in the caller's
language, checks the clinic's real schedule, books, reschedules and cancels appointments, and hands
emergencies to staff. Every call is transcribed and shown on a clinic dashboard with its outcome.

## Layout

This is an npm-workspaces monorepo.

| Path                   | What it is                                                              |
| ---------------------- | ----------------------------------------------------------------------- |
| `apps/web`             | Next.js app: marketing site, Cognito auth, onboarding, dashboard        |
| `apps/api`             | Hono REST API (Cognito-authenticated routes)                            |
| `apps/voice-gateway`   | WebSocket voice session engine: Sarvam STT/TTS, Bedrock, recorder       |
| `workers/post-call`    | Call summary, outcome and sentiment, stale-call sweep and 90-day purge (local SQS runner and Lambda handler) |
| `workers/notifier`     | Lambda handlers: deliver queued notifications and queue reminders (also a local runner) |
| `packages/db`          | Drizzle schema, migrations, demo seed, typed client                     |
| `packages/core`        | Domain services: scheduling, auth helpers      |
| `packages/storage`     | S3 blob store (presigned URLs) and SQS queue clients, with test fakes   |
| `packages/shared`      | Zod schemas, API types, tool definitions, constants                     |
| `packages/voice-sdk`   | Browser client: mic capture, playback, barge-in, events, React hook                 |
| `infra`                | AWS CDK app: Auth, Storage, Notify, Network, Data, Workers, Services, Observability, Cicd stacks |

## Local setup

Prerequisites: Node 22, npm 10+ (npm workspaces; pnpm is not supported) and Docker (for local Postgres).

1. `npm install`
2. `cp .env.example .env`, then fill in the keys below.
3. `scripts/dev.sh` (also `npm run dev`).

Keys needed for a local run:

- `SARVAM_TTS_API_KEY`: one Sarvam key serves speech-to-text and text-to-speech.
- `BEDROCK_MODEL_ID`: use `global.amazon.nova-2-lite-v1:0`. Amazon Nova only.
- The five Cognito keys: `NEXT_PUBLIC_COGNITO_USER_POOL_ID`, `NEXT_PUBLIC_COGNITO_CLIENT_ID`,
  `NEXT_PUBLIC_COGNITO_DOMAIN`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`. `scripts/bootstrap-aws.sh`
  prints them after deploying the Auth stack, or copy them from the Cognito console of the secondary
  AWS account.
- `AUTH_MODE`: `cognito` (the default when unset). See "Auth modes".

Notification keys (all optional locally; see "Notifications"):

- `NOTIFY_PROVIDER`: `console` (default when `NOTIFY_FROM_EMAIL` is unset) or `aws` (alias `ses`;
  default when `NOTIFY_FROM_EMAIL` is set)
- `NOTIFY_FROM_EMAIL`: verified SES sender address
- `SMS_ENABLED`: `1` turns on SMS through SNS
- `WHATSAPP_ENABLED`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`: WhatsApp Cloud API

Billing keys (optional; billing is off unless `BILLING_ENABLED=1`, then all four Razorpay values are required; see "Plans and billing"):

- `BILLING_ENABLED`: `1` turns on Razorpay subscriptions and the Upgrade button
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`: Razorpay API credentials
- `RAZORPAY_WEBHOOK_SECRET`: secret for the webhook signature
- `RAZORPAY_PLAN_ID_STANDARD`: Razorpay plan id for the Standard plan

`scripts/dev.sh` starts Postgres, builds the shared packages, runs migrations and the demo seed,
then runs the API, voice gateway, web app and the notifier worker together (the notifier delivers
every 10 s and queues reminders every 60 s). It fails early if `AUTH_MODE=cognito` and
`COGNITO_USER_POOL_ID` or `COGNITO_CLIENT_ID` is empty.

| Service       | Port |
| ------------- | ---- |
| web           | 3000 |
| api           | 4000 |
| voice-gateway | 4100 |
| Postgres      | 5433 |

Checks: `npm test`, `npm run typecheck` and `npm run lint`. Other root scripts: `build`, `format`,
`format:check`, `db:up`, `db:down`, `db:migrate`, `db:seed`.

`npm test` needs Postgres up and migrated (`npm run db:up && npm run db:migrate`). If the database
is unreachable, the db suite is skipped with a warning instead of failing. `build`, `test` and
`typecheck` first build the workspace packages (`npm run build:packages`).

### Notifications

Bookings write confirmation rows to an outbox, and the notifier worker delivers them and queues
reminders 20 to 24 hours and 1 to 2 hours before an appointment. Email goes to patients with an
email on file; without one the row is `skipped` ("No email on file"). A queued confirmation (or
reschedule message) stands in for a reminder that is already close: a visit 24 hours away or less
gets no day-before reminder, and one 2.5 hours away or less gets no 2-hour reminder either, so a
fresh booking does not get a confirmation and a reminder back to back. The 2-hour reminder also
needs the booking to be at least 30 minutes old. Rescheduling or cancelling drops any message still queued
for the old time (`skipped`, "Replaced by a later message"). Delivery is at-least-once: a crash
between send and the sent mark re-sends after 5 minutes. Locally, open the Notifications page in
the web app to see every message and its status. The console provider (`NOTIFY_PROVIDER` unset
with no `NOTIFY_FROM_EMAIL`, or `console`) logs counts only, never recipients.

To send real email with SES (secondary AWS account only):

1. Deploy the `MuxarisNotify` stack, which creates the `muxaris.com` identity.
2. Add the three DKIM CNAME records it outputs at GoDaddy and wait for the identity to verify.
3. Request SES production access, then set `NOTIFY_FROM_EMAIL`. The provider then defaults to
   `aws`; `NOTIFY_PROVIDER=aws` (or its alias `ses`) makes it explicit.

SMS and WhatsApp are not live. SMS to Indian numbers needs TRAI DLT registration and SNS sandbox
exit; WhatsApp needs a Meta Business account and approved message templates. Both stay off until
their flags are set.

### Analytics and plans

The dashboard has an **Analytics** page (call volume, outcomes and busiest hours over a date range of
at most 92 days, bucketed by the clinic's local day) and a **Plan** section in Settings. The Plan
section shows the current plan, this month's usage against the included call minutes, overage, the
pilot end date (30 days after the clinic was created; shown only, never enforced) and, when billing
is on, an Upgrade button for owners.

### Plans and billing

Billing is behind `BILLING_ENABLED=1`. Test the webhook locally (the command reads the secret from
your environment; never paste real secrets into docs or commits):

```bash
BODY='{"event":"subscription.activated","payload":{"subscription":{"entity":{"id":"sub_x","status":"active","plan_id":"plan_x","current_end":null}}}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$RAZORPAY_WEBHOOK_SECRET" | sed 's/^.* //')
curl -s -X POST localhost:4000/webhooks/razorpay -H "Content-Type: application/json" -H "X-Razorpay-Signature: $SIG" --data "$BODY"
```

A subscription id that no clinic owns is answered `{"result":"ignored"}` without
changing anything; create one through the Upgrade button first (or the API) to see a plan change.
See [Architecture](docs/ARCHITECTURE.md#plans-usage-and-billing).

### Try the assistant

1. Open <http://localhost:3000/sign-up> and sign up with a real email; enter the verification code
   Cognito emails you.
2. In onboarding, choose "Load demo clinic" (Sunrise Dental Care).
3. Open `/app/assistant/try` and allow the microphone.
4. Say "I want a teeth cleaning tomorrow afternoon" and confirm the slot the assistant offers.
5. Open `/app/appointments` to see the booking.

### Auth modes

- `AUTH_MODE=cognito` (default): the API and voice gateway verify real Cognito access tokens using
  `COGNITO_USER_POOL_ID` and `COGNITO_CLIENT_ID`. Use this to run the full stack.
- `AUTH_MODE=dev`: accepts `dev:<sub>:<email>` tokens. It is for API and gateway tests only, is
  refused when `NODE_ENV=production`, and does not sign you in to the web app.

### Voice stack

Sarvam Saaras (speech-to-text) and Bulbul (text-to-speech) run over WebSocket. The reasoning step
is Amazon Bedrock Nova 2 Lite called through the Converse API with tools (Amazon Nova only; no
Anthropic models). Browser calls are capped at `MAX_CALL_SECONDS`, and each gateway instance allows
at most `MAX_SESSIONS` concurrent calls, kept under Sarvam's limit of 20 sockets.

## AWS

Only the `aws-secondary-account` profile is ever used (account `005533348545`, region `ap-south-1`);
every AWS-touching script sources `scripts/lib/aws-guard.sh`, which aborts on any other account, and
CDK runs through `infra/scripts/cdk.sh`, which applies the guard. Never use the primary profile.

### Deployed topology

An internet-facing ALB routes `voice.muxaris.com` and the paths `/v1/session*` and `/v1/telephony/*`
to the voice gateway, and everything else to the API. Both run on ECS Fargate (ARM64) in the public
subnets; the gateway is exactly one task. RDS Postgres 16 sits in isolated subnets. Four Lambdas
(post-call, stale-call sweep, notification delivery, reminders) run in private subnets behind one NAT
gateway, driven by SQS (with a dead-letter queue) and EventBridge. Call recordings go to S3, models
are Amazon Nova on Bedrock, email goes through SES, and secrets (`muxaris/db`, `muxaris/app`) are
read from Secrets Manager at process start. Alarms go to SNS and a CloudWatch dashboard shows
latency and call counts. The web app stays on Netlify and DNS stays at GoDaddy. Details:
[Architecture](docs/ARCHITECTURE.md), [AWS services and cost](docs/AWS-SERVICES.md).

### Deploy quick-start

Full steps, including secrets, DNS and the certificate, are in the [Runbook](docs/RUNBOOK.md). In
short, on a fresh account:

    scripts/bootstrap-aws.sh                      # CDK bootstrap + Cognito; put the printed ids in .env
    npm run deploy:network -w @muxaris/infra && npm run deploy:data -w @muxaris/infra
    scripts/bootstrap-aws.sh --secrets            # Sarvam etc. from .env into muxaris/app
    scripts/bootstrap-aws.sh --outputs            # DB_SECRET_ARN, APP_SECRET_ARN into .env; set IMAGE_TAG
    scripts/push-images.sh <git short sha>
    npm run deploy:workers -w @muxaris/infra      # then deploy:services, deploy:observability, deploy:cicd
    scripts/migrate.sh
    scripts/smoke.sh http://<AlbDnsName>
    scripts/request-cert.sh                       # prints the ACM validation CNAMEs and CERT_ARN=

On a truly empty account set `COGNITO_USER_POOL_ID` and `COGNITO_CLIENT_ID` to `pending` in `.env`
before the first `scripts/bootstrap-aws.sh` (the CDK app refuses to synth without them); see the
Runbook. `infra/scripts/cdk.sh` sources `.env` last, so set `IMAGE_TAG` and `CERT_ARN` in `.env`,
not as a command prefix.

Then add `CERT_ARN` to `.env`, redeploy `MuxarisServices`, point `api.muxaris.com` and
`voice.muxaris.com` at the ALB at GoDaddy, run `scripts/smoke.sh https://api.muxaris.com`, and set
the Netlify variables below.

After that, every push to `main` runs `.github/workflows/deploy-aws.yml` (images, CDK deploy,
migrations, smoke test) through GitHub OIDC with no stored AWS keys. It reads these repository
variables (Settings, Secrets and variables, Actions, Variables):

| Variable               | Value                                                     |
| ---------------------- | --------------------------------------------------------- |
| `AWS_DEPLOY_ROLE_ARN`  | output `DeployRoleArn` of the `MuxarisCicd` stack         |
| `COGNITO_USER_POOL_ID` | Cognito user pool id                                      |
| `COGNITO_CLIENT_ID`    | Cognito app client id                                     |
| `CERT_ARN`             | ACM certificate ARN; unset means the ALB serves HTTP only |
| `NOTIFY_FROM_EMAIL`    | SES sender address                                        |
| `ALARM_EMAIL`          | alarm notification recipient                              |
| `BILLING_ENABLED`      | `1` to enable billing, anything else for off              |

The workflow has not yet run on a real push to `main`.

### Known limits

- Sarvam Starter allows 20 concurrent STT sockets and 60 requests per minute; the gateway caps
  itself at `MAX_SESSIONS` (15) per instance.
- The gateway is one task with per-process concurrency counters, so it does not scale out, and a
  deploy has a short gap with no gateway.
- Lambdas reach the internet through a single NAT gateway.
- Indian SMS needs TRAI DLT registration, so email is the live notification channel.
- Browser calls are capped at 20 minutes (`MAX_CALL_SECONDS`, 1200 s).
- Phone calls need a Twilio number and KYC; see [Telephony](docs/TELEPHONY.md).

## Deploy (Netlify)

The web app deploys from the repo root with `netlify.toml` (build command
`npm run build:packages && npm run build -w @muxaris/web`, publish `apps/web/.next`, Node 22,
`@netlify/plugin-nextjs`). Leave the Netlify base directory empty (the repository root): the web
app imports `@muxaris/shared` and `@muxaris/voice-sdk`, which must be built first, so a base of
`apps/web` will not build.

Set these environment variables in the Netlify site settings (they are inlined at build time, so
redeploy after changing them):

| Variable                           | Value                                                          |
| ---------------------------------- | -------------------------------------------------------------- |
| `NEXT_PUBLIC_COGNITO_USER_POOL_ID` | Cognito user pool id (from `scripts/bootstrap-aws.sh`)         |
| `NEXT_PUBLIC_COGNITO_CLIENT_ID`    | Cognito app client id                                          |
| `NEXT_PUBLIC_COGNITO_DOMAIN`       | Cognito hosted UI domain                                       |
| `NEXT_PUBLIC_API_URL`              | Public https URL of the API                                    |
| `NEXT_PUBLIC_VOICE_WS_URL`         | Public `wss://` URL of the voice gateway (`ws://` is rejected) |
| `NEXT_PUBLIC_GOOGLE_ENABLED`       | `1` to show Google sign-in, otherwise unset               |

If the Cognito variables are unset, every `/app` request redirects to sign-in. The API and voice
gateway are deployed to AWS, not by Netlify: `NEXT_PUBLIC_API_URL` is `https://api.muxaris.com` and
`NEXT_PUBLIC_VOICE_WS_URL` is `wss://voice.muxaris.com` once the ALB is behind those names.

## Scripts

| Script                                       | What it does                                                                                              |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `scripts/dev.sh` (`npm run dev`)             | Local stack: Postgres, migrations, seed, then web, API, gateway and workers                               |
| `scripts/bootstrap-aws.sh`                   | CDK bootstrap and the Auth stack; prints the Cognito ids                                                  |
| `scripts/bootstrap-aws.sh --secrets`         | Upserts the `muxaris/app` secret from `.env` (prints key names only)                                      |
| `scripts/bootstrap-aws.sh --outputs`         | Prints stack outputs as `KEY=value` lines                                                                 |
| `scripts/build-images.sh [tag]`              | Builds both service images for linux/arm64 locally                                                        |
| `scripts/push-images.sh [tag]`               | Builds and pushes both images to ECR (immutable tags); prints `IMAGE_TAG=`                                |
| `scripts/migrate.sh`                         | Runs the `muxaris-migrate` Fargate task, prints the last 50 log lines, fails on a non-zero exit code      |
| `scripts/smoke.sh <base-url>`                | Post-deploy checks through the ALB (`SMOKE_TOKEN` is only used over https)                                |
| `scripts/request-cert.sh`                    | Requests the ACM certificate; prints the DNS validation CNAMEs and `CERT_ARN=`                            |
| `scripts/create-demo-user.sh <email>`        | Creates or resets a confirmed Cognito user for local sign-in                                              |
| `scripts/update-rds-ca.sh`                   | Regenerates `packages/db/src/rds-ca.ts` from the public RDS CA bundle (no AWS access)                     |
| `scripts/test-fresh-db.sh`                   | Checks that all migrations apply to a fresh database                                                      |
| `scripts/e2e-voice.sh`                       | E2E voice smoke test (see below)                                                                          |
| `scripts/gen-assets.sh`, `gen-image.sh`      | Generates landing-page imagery (Azure gpt-image)                                                          |
| `scripts/gen-audio.sh`                       | Generates greeting and sample-call audio (Sarvam)                                                         |
| `npm run deploy:<stack> -w @muxaris/infra`   | Deploys one stack: `auth`, `storage`, `notify`, `network`, `data`, `workers`, `services`, `observability`, `cicd` (or `all`, which deploys only Network, Data, Workers, Services, Observability and Cicd; Auth, Storage and Notify are separate) |
| `npm run workers:dev`                        | Runs the post-call and notifier workers locally                                                           |

### Post-call worker

`workers/post-call` consumes the `call.completed` messages the voice gateway sends to SQS. For each call it reads the turns from Postgres, asks Amazon Nova Pro on Bedrock (`apac.amazon.nova-pro-v1:0`) for a summary of at most 60 words, sentiment, entities and an outcome refinement, writes them back through core services (a staff or booking outcome is never overwritten) and creates a callback row when the caller asked for one and a phone number is known. It also runs the stale-call sweep and the 90-day retention purge every minute. Env keys: `POST_CALL_QUEUE_URL` (required to start), `POST_CALL_MODEL_ID`, `AWS_REGION`, `DATABASE_URL`. `src/lambda.ts` exports the SQS and schedule handlers that run on AWS Lambda.

### Phase 2: call recordings and summaries

Calls are recorded as stereo WAV and stored with a transcript in S3, then summarised by the
post-call worker. Deploy the bucket and queue once with
`npm run deploy:storage -w @muxaris/infra` (secondary AWS account only). Env keys:

- `CALLS_BUCKET`: S3 bucket for recordings and transcripts
- `POST_CALL_QUEUE_URL`: SQS queue the gateway publishes `call.completed` to
- `STORAGE_DISABLED`: set to `1` to skip S3 and SQS locally (calls then have no recording)
- `POST_CALL_MODEL_ID`: Bedrock model for the summary (default `apac.amazon.nova-pro-v1:0`)

Run the worker locally with `npm run workers:dev`. Clinics can turn recording off in Settings
(`settings.recordCalls`); the assistant's opening note always says calls are transcribed, and says
"recorded" only when recording is on for the clinic and storage is configured.
To check the whole pipeline against real providers, run
`E2E_WITH_WORKER=1 E2E_EXPECT_SUMMARY=1 bash scripts/e2e-voice.sh`; it also checks that the
presigned recording URL serves a WAV. See [Architecture](docs/ARCHITECTURE.md).

### E2E voice smoke

    bash scripts/e2e-voice.sh        # needs Postgres up, .env with SARVAM_TTS_API_KEY, AWS secondary profile

Starts a second api (4001) and voice-gateway (4101) with `AUTH_MODE=dev` (the dev stack on
3000/4000/4100 is untouched), creates a fresh clinic with demo data, synthesises a spoken request
("I want a teeth cleaning tomorrow afternoon") with Sarvam TTS, streams it to the gateway at
real-time pace, answers the assistant's follow-ups (name, phone, confirm) with further synthetic
speech, then checks that an `ai_call` appointment row exists. It prints the masked event stream and
the speech-end to first-reply-audio latency, and exits 0 on success. Output (`e2e-events.log`,
`e2e-reply.wav`, api/gateway logs) goes to `E2E_OUT_DIR` (default `$TMPDIR/muxaris-e2e`). Overrides:
`E2E_LANGUAGE`, `E2E_UTTERANCE`, `E2E_API_URL`, `E2E_WS_URL`. Uses real providers and costs a little.

## Docs

- [Spike results (Sarvam, Bedrock)](docs/SPIKES.md)
- [Architecture, call pipeline and deployed topology](docs/ARCHITECTURE.md)
- [AWS services, cost and alternatives](docs/AWS-SERVICES.md)
- [Runbook: deploy, rotate, roll back, alarms](docs/RUNBOOK.md)
- [Telephony (Twilio)](docs/TELEPHONY.md)
- [Brand and assets](docs/BRAND.md)
- [Platform design spec](docs/superpowers/specs/2026-10-04-muxaris-platform-design.md)
- [Phase 0 plan](docs/superpowers/plans/2026-10-04-phase-0-foundation.md)

## License

MIT, see `LICENSE`.
