# Muxaris

Muxaris is an AI voice receptionist for Indian dental clinics. It answers calls in the caller's
language, checks the clinic's real schedule, books, reschedules and cancels appointments, and hands
emergencies to staff. Every call is transcribed, summarised and shown on a clinic dashboard.

## Layout

This is an npm-workspaces monorepo.

| Path                   | What it is                                                              |
| ---------------------- | ----------------------------------------------------------------------- |
| `apps/web`             | Next.js app: marketing site, Cognito auth, onboarding, dashboard        |
| `apps/api`             | Hono REST API on Fargate: Cognito JWT verify, Drizzle, OpenAPI          |
| `apps/voice-gateway`   | WebSocket voice session engine: Sarvam STT/TTS, Bedrock, recorder       |
| `workers/post-call`    | Lambda: call summary, outcome and sentiment                             |
| `workers/notifier`     | Lambda: dispatches notifications from a queue                           |
| `workers/reminders`    | Lambda (cron): finds appointments due for reminders                     |
| `packages/db`          | Drizzle schema, migrations, demo seed, typed client                     |
| `packages/core`        | Domain services: scheduling, patients, calls, notifications, plans      |
| `packages/shared`      | Zod schemas, API types, tool definitions, constants                     |
| `packages/voice-sdk`   | Browser client: mic capture, playback, barge-in, events                 |
| `infra`                | AWS CDK app: network, data, services, workers, observability, CI/CD    |

## Local setup

1. `cp .env.example .env` and fill in the values.
2. `npm install`
3. `npm run db:up` to start Postgres on port 5433.
4. `npm run db:migrate && npm run db:seed`
5. `npm run dev`

Other root scripts: `npm run build`, `lint`, `typecheck`, `test`, `format`.

## AWS

Only the `aws-secondary-account` profile is ever used; see `scripts/lib/aws-guard.sh`.

## Docs

- [Platform design spec](docs/superpowers/specs/2026-10-04-muxaris-platform-design.md)
- [Phase 0 plan](docs/superpowers/plans/2026-10-04-phase-0-foundation.md)

## License

MIT, see `LICENSE`.
