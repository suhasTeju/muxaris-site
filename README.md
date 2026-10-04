# Muxaris

Muxaris is an AI voice receptionist for Indian dental clinics. It answers calls in the caller's
language, checks the clinic's real schedule, books, reschedules and cancels appointments, and hands
emergencies to staff. Every call is transcribed, summarised and shown on a clinic dashboard.

## Layout

This is an npm-workspaces monorepo.

| Path                   | What it is                                                              |
| ---------------------- | ----------------------------------------------------------------------- |
| `apps/web`             | Next.js app: marketing site, Cognito auth, onboarding, dashboard        |
| `apps/api`             | Hono REST API on Fargate: health endpoint; auth and routes in Phase 1  |
| `apps/voice-gateway`   | WebSocket voice session engine: Sarvam STT/TTS, Bedrock, recorder       |
| `workers/post-call`    | Lambda: call summary, outcome and sentiment (planned, Phase 1+)                             |
| `workers/notifier`     | Lambda: dispatches notifications from a queue (planned, Phase 1+)                           |
| `workers/reminders`    | Lambda (cron): finds appointments due for reminders (planned, Phase 1+)                     |
| `packages/db`          | Drizzle schema, migrations, demo seed, typed client                     |
| `packages/core`        | Domain services: scheduling, patients, calls, notifications, plans (planned, Phase 1+)      |
| `packages/shared`      | Zod schemas, API types, tool definitions, constants                     |
| `packages/voice-sdk`   | Browser client: mic capture, playback, barge-in, events (planned, Phase 1+)                 |
| `infra`                | AWS CDK app: network, data, services, workers, observability, CI/CD    |

## Prerequisites

Node 22, npm 10+ (npm workspaces; pnpm is not supported), and Docker (for local Postgres).

## Local setup

1. `cp .env.example .env` and fill in the values.
2. `npm install`
3. `npm run db:up` to start Postgres on port 5433.
4. `npm run db:migrate && npm run db:seed`
5. `npm run dev`

Other root scripts: `npm run build`, `lint`, `typecheck`, `test`, `format`.

`npm test` needs Postgres up and migrated (`docker compose up -d && npm run db:migrate`). If the
database is unreachable, the db suite is skipped with a warning instead of failing.
`build`, `test` and `typecheck` first build `@muxaris/shared` and `@muxaris/db` (`npm run build:packages`).

## AWS

Only the `aws-secondary-account` profile is ever used; see `scripts/lib/aws-guard.sh`. Infra scripts run CDK through `infra/scripts/cdk.sh`, which applies the guard. Setup: `scripts/bootstrap-aws.sh`.

## Scripts

- `scripts/bootstrap-aws.sh`: deploys the Auth stack and prints the Cognito ids
- `scripts/gen-assets.sh`: generates landing-page imagery (Azure gpt-image)
- `scripts/gen-audio.sh`: generates greeting and sample-call audio (Sarvam)

## Docs

- [Spike results (Sarvam, Bedrock)](docs/SPIKES.md)
- [Brand and assets](docs/BRAND.md)
- [Platform design spec](docs/superpowers/specs/2026-10-04-muxaris-platform-design.md)
- [Phase 0 plan](docs/superpowers/plans/2026-10-04-phase-0-foundation.md)

## License

MIT, see `LICENSE`.
