# Muxaris platform design (approved 2026-10-04)

> Source of truth for the product rebuild. Approved by the user in Claude Code plan mode on 2026-10-04. Per-phase plans live in `docs/superpowers/plans/`.


## Context

The `muxaris` repo today is a one-commit static Astro marketing site for an unrelated product (a "role-based LLM gateway"), with legal pages that describe a Langfuse fork. It exists only because it qualified for AWS credits. The user now wants to rebuild it, in this repo and under the **Muxaris** name and **muxaris.com** domain, as a real end-to-end SaaS: the product direction, copy structure and visual reference come from the earlier private repo `suhasTeju/svara-ai` ("Svara: AI voice receptionist for Indian clinics").

Goals, in priority order:
1. A product a dental clinic could actually use: landing → sign-up → onboarding → dashboard → talk to the assistant → it books real appointments against the clinic's real schedule.
2. Substantial, legible AWS usage (for the next credits application) with reproducible, scripted infra.
3. A codebase that is a solid foundation to keep building on.

Decisions already made with the user (do not re-ask):

| Topic | Decision |
|---|---|
| Name / domain | **Muxaris**, muxaris.com. Frontend stays on **Netlify**, auto-deployed on push to `main`. |
| AWS shape | Backend on **AWS, region ap-south-1 (Mumbai)**, secondary account `aws-secondary-account` profile (acct 005533348545, IAM user `admin`). Containers on **ECS Fargate**, RDS Postgres, S3, SQS, Lambda, Bedrock, CDK. |
| **AWS account rule** | **Only the secondary account (005533348545) is ever used. Never the primary/default profile (594862665011).** Every `aws`/`cdk` invocation passes `--profile aws-secondary-account`; every script starts with an account guard that aborts unless `sts get-caller-identity` returns 005533348545; CDK `env` is pinned to that account id; GitHub Actions assumes a role only in that account. `AWS_PROFILE=aws-secondary-account` is set in `.env.example` and `scripts/dev.sh`. |
| Auth | **Amazon Cognito** User Pool (email/password + Google IdP), custom-branded sign-in/sign-up pages in Next.js via Amplify Auth, tokens verified in the API with `aws-jwt-verify`. Clinic membership and roles live in Postgres (`memberships`), not in Cognito groups. |
| Voice | **Self-orchestrated pipeline**: Sarvam Saaras STT (WebSocket) → Amazon Bedrock Claude with tools → Sarvam Bulbul TTS. Browser calling first; telephony adapter designed in, wired later. |
| Market | India, multilingual (en-IN, hi-IN, kn-IN, ta-IN, te-IN; code-mixed). INR pricing. |
| Messaging | Pluggable notification providers. SES email live; SMS and WhatsApp adapters implemented behind flags. |
| Scope | Scheduling core, call center, patients + reminders, analytics + billing (Razorpay behind a flag). |
| Assets | gpt-image-2 (Azure endpoint in `.env`) for imagery; Sarvam TTS for audio samples. |

Environment facts verified during planning:
- `.env` in repo root has `SARVAM_TTS_API_KEY`, `GPT_IMAGE_ENDPOINT`, `GPT_IMAGE_API_KEY` (gitignored). One Sarvam key serves STT, TTS and chat.
- Secondary AWS account is empty: default VPC only, no CloudFormation stacks, SES has no identities, SMS is in sandbox. Bedrock lists Claude Haiku 4.5 / Sonnet 4.5 / Opus 4.5 and Nova models in ap-south-1.
- muxaris.com NS is GoDaddy (`domaincontrol.com`), A record points at Netlify. No Route53 zones in either account.
- Tooling: node 22, npm 10.9, **pnpm is broken** (corepack module missing) → use **npm workspaces**. Docker 28, aws-cli 2, terraform 1.15, `gh`, `clerk` CLI 1.5, `az` logged in. No `cdk` global (use `npx cdk`).
- svara-ai is private; fetch via `gh api` or clone into the scratchpad.

Assumptions stated here so they are not re-litigated:
- **Visual system**: Muxaris wordmark and a new mark, on Svara's warm clinic-facing system (Fraunces display + Inter body, paper/ink surfaces, a green accent). The current amber/teal "ops console" look is for an LLM gateway and is wrong for clinic owners. Copy structure follows Svara's landing page with Muxaris branding.
- **IaC**: AWS CDK v2 in TypeScript (same language as the monorepo, no global install). Terraform is available but mixing languages buys nothing.
- **Data residency**: everything in ap-south-1, since the copy promises Indian data residency.
- **SMS to India**: Amazon SNS cannot deliver transactional SMS to Indian numbers without TRAI DLT registration, and the account is in SMS sandbox. SMS is therefore *implemented but not live* in v1. Email (SES) is the live channel; WhatsApp is next once a WABA exists.

## User actions required (none block Phases 0–2)

1. **Google sign-in**: create a Google OAuth client (Cloud Console) with the Cognito hosted domain as the redirect URI; put client id/secret into `.env` (`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`). Email/password sign-in works without this.
2. **Netlify**: change the site's build settings to base dir `apps/web` (or accept the `netlify.toml` change in the PR); add env vars printed by the bootstrap script (`NEXT_PUBLIC_COGNITO_USER_POOL_ID`, `NEXT_PUBLIC_COGNITO_CLIENT_ID`, `NEXT_PUBLIC_COGNITO_DOMAIN`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_VOICE_WS_URL`). Until the Cognito stack exists, local dev uses a dev user pool created by `scripts/bootstrap-aws.sh --dev`.
3. **DNS at GoDaddy**: CNAME `api.muxaris.com` and `voice.muxaris.com` → ALB DNS name, plus the ACM validation CNAMEs the bootstrap script prints. Until then the API/gateway run on the ALB default hostname with a free `*.muxaris.com`-less cert path (plain HTTP to the ALB, HTTPS via CloudFront default domain).
4. **SES**: verify `muxaris.com` identity (DKIM CNAMEs printed by the script) and request production access.
5. **GitHub**: add `AWS_DEPLOY_ROLE_ARN` repo variable after bootstrap (OIDC, no long-lived keys).
6. Later phases: Exotel or Twilio account for a real number; Razorpay keys; Meta WhatsApp Business account.

## Architecture

```
                 muxaris.com (Netlify)                      AWS ap-south-1 (CDK)
┌──────────────────────────────────────┐     ┌──────────────────────────────────────────────────┐
│ apps/web  Next.js 16 App Router      │     │ ALB (host routing, idle timeout 3600s)           │
│  marketing · Cognito auth · onboard. │     │   api.muxaris.com   → ECS Fargate apps/api       │
│  dashboard · browser call UI         │ ──► │   voice.muxaris.com → ECS Fargate apps/voice-gw  │
│  (server comps call API w/ Cognito  │ WS  │ Cognito User Pool (email + Google)               │
│   access token from Amplify SSR)     │     │ RDS Postgres 16 (private subnets)                │
└──────────────────────────────────────┘     │ S3: recordings, exports      Secrets Manager     │
                                              │ SQS: post-call, notifications                   │
        Sarvam AI (api.sarvam.ai)             │ Lambda: post-call worker, notifier, reminders   │
        STT saaras:v4 WS  ◄──────────────────│ EventBridge: reminder cron                      │
        TTS bulbul:v3     ◄──────────────────│ Bedrock: Claude Haiku 4.5 (talk), Sonnet (sum.) │
                                              │ SES / SNS · CloudWatch logs+dashboard+alarms    │
                                              │ ECR · IAM OIDC for GitHub Actions               │
                                              └──────────────────────────────────────────────────┘
```

Why two Fargate services: the API is stateless HTTP; the voice gateway holds long-lived WebSockets and does audio work. They scale and deploy independently but share `packages/core` so a tool call from the assistant and a click in the dashboard run the same service code.

Why the web app does not talk to Postgres directly: Netlify functions reaching RDS needs a public DB or RDS Proxy and leaks connections. All data access goes through `apps/api`, which also makes the AWS footprint the real backend rather than a sidecar.

### Monorepo layout (npm workspaces)

```
apps/web/            Next.js 16, Tailwind v4, Amplify Auth (Cognito) + @aws-amplify/adapter-nextjs, deployed to Netlify
apps/api/            Hono on Node 22 (Fargate). REST, Cognito JWT verify (aws-jwt-verify), Drizzle. Zod + OpenAPI.
apps/voice-gateway/  Node 22 WS server (Fargate). Session engine, Sarvam STT/TTS, Bedrock, recorder.
workers/post-call/   Lambda: summary, outcome, sentiment via Bedrock; writes back; enqueues notifications
workers/notifier/    Lambda: consumes notification queue, dispatches via provider interface
workers/reminders/   Lambda (EventBridge cron, 15 min): finds appointments due for reminders, enqueues
packages/db/         Drizzle schema, migrations, seed (demo clinic), typed client
packages/core/       Domain services: scheduling (slot engine), patients, calls, notifications, plans
packages/shared/     Zod schemas, API types, tool definitions, constants (languages, specialties)
packages/voice-sdk/  Browser client: mic capture (AudioWorklet, 16k PCM), playback, barge-in, events
infra/               CDK app: network, data, services, workers, observability, cicd stacks
scripts/             bootstrap-aws.sh, dev.sh, seed.ts, gen-assets.sh, gen-audio.sh, smoke.sh
docs/                ARCHITECTURE.md, AWS-SERVICES.md (inventory for credits), RUNBOOK.md, superpowers/specs|plans
```

Everything from the Astro site goes: `src/`, `astro.config.mjs`, `public/favicon.svg`. `netlify.toml` is rewritten for Next.js (`@netlify/plugin-nextjs`, `base = "apps/web"`). README and LICENSE rewritten (keep MIT, remove Langfuse).

### Data model (Postgres, Drizzle; all tenant tables carry `clinic_id`)

- `clinics` (id, name, slug, specialty, city, timezone, languages[], plan, settings jsonb)
- `users` (id, cognito_sub, email, name, created_at) — upserted on first authenticated API call and by the Cognito post-confirmation Lambda trigger
- `memberships` (user_id, clinic_id, role owner|front_desk, invited_by, status) — a user may belong to several clinics; the active clinic is chosen in the app and sent as `X-Clinic-Id`, validated against memberships
- `invitations` (clinic_id, email, role, token, expires_at) — team invites, accepted after Cognito sign-up
- `doctors` (name, specialties[], languages[], color, active)
- `working_hours` (doctor_id, weekday, start, end), `time_off` (doctor_id, start, end, reason), `clinic_holidays`
- `services` (name, duration_min, buffer_min, price_inr, description, bookable_by_ai)
- `slot_rules` per clinic (slot_grain_min, lead_time_min, max_days_ahead, allow_same_day, max_per_slot)
- `patients` (phone E.164, name, preferred_language, notes, dob?, consent_at)
- `appointments` (patient_id, doctor_id, service_id, starts_at, ends_at, status scheduled|confirmed|rescheduled|cancelled|completed|no_show, source ai_call|dashboard|web, created_by_call_id)
- `assistant_profiles` (name, voice per language jsonb, greeting per language, tone, handoff_number, faq jsonb, knowledge text)
- `calls` (channel browser|phone, caller_phone, language_detected, started_at, ended_at, duration_s, status, outcome booked|rescheduled|cancelled|info|callback|handoff|abandoned, recording_s3_key, summary, sentiment, transcript_s3_key)
- `call_turns` (call_id, seq, role user|assistant|tool, text, tool_name, tool_args, tool_result, latency_ms, started_at)
- `callbacks` (call_id, patient_id, reason, priority, status open|done, assigned_to)
- `notifications` (channel email|sms|whatsapp, to, template, payload, status queued|sent|failed|skipped, provider_id, error)
- `usage_ledger` (clinic_id, month, call_seconds, calls, llm_tokens) and `plans` (pilot, standard: limits + price)
- `demo_requests` (public form), `audit_log`

### Voice session engine (apps/voice-gateway)

Transport-agnostic core, decided now:

```ts
interface MediaTransport { onInboundAudio(cb:(pcm16:Buffer, rate:number)=>void); sendAudio(pcm16:Buffer, rate:number): void; sendEvent(e:GatewayEvent): void; onClose(cb) }
class VoiceSession { constructor(transport, ctx:{clinic, assistant, tools, callId}) }
```

Flow per session:
1. Client connects `wss://voice…/v1/session?token=<Cognito access token or short-lived demo token>&clinic=<id>`; gateway verifies the token (`aws-jwt-verify`, same verifier as the API), checks membership, loads clinic + assistant profile, creates `calls` row, sends `ready`, plays greeting (pre-synthesised per language, cached in S3/memory).
2. Inbound PCM16 16 kHz → Sarvam STT WS `wss://api.sarvam.ai/speech-to-text/ws?model=saaras:v4&language-code=unknown&mode=codemix&sample_rate=16000&input_audio_codec=pcm_s16le&vad_signals=true` (header `Api-Subscription-Key`). Partial/final transcripts forwarded to client as events.
3. `END_SPEECH` + final transcript → Bedrock Converse **stream** (Claude Haiku 4.5, inference profile if required in ap-south-1) with system prompt (clinic facts, rules: no medical advice, emergencies → handoff, ≤2 short sentences, reply in caller's language) and tools from `packages/shared/tools`: `get_clinic_info`, `find_slots`, `book_appointment`, `reschedule_appointment`, `cancel_appointment`, `lookup_patient`, `request_callback`, `transfer_to_staff`, `end_call`. Tool handlers call `packages/core` directly (same code as the dashboard).
4. LLM text stream → sentence chunker → Sarvam TTS. **One TTS connection per utterance** (open → config → text → flush → close) because Sarvam has no server-side cancel; barge-in (`START_SPEECH` while speaking) = close socket, send `flush_playback` to client, cancel LLM stream. TTS WS URL/schema is verified in the Phase 0 spike (fallback: REST `/text-to-speech` per sentence, which is documented).
5. Recorder mixes inbound/outbound PCM into a stereo WAV, uploads to S3 on end; transcript JSON to S3; `calls` row finalised; `call.completed` message to SQS.
6. Guards: per-clinic concurrent-call cap, plan minute cap (usage ledger), global cap from Sarvam Starter limits (20 STT sockets) → graceful "all lines busy" event. Max call length 10 min for browser.

Telephony later: `TwilioMediaStreamTransport` / `ExotelTransport` implement `MediaTransport` with 8 kHz μ-law ↔ PCM16 16 kHz transcoding and inbound webhook → session creation. Phase 5 ships the interface plus a Twilio implementation that activates when env is present.

Browser side (`packages/voice-sdk`, reusing svara-ai `VoiceAgent.tsx` logic): AudioWorklet captures 48 kHz, downsamples to 16 kHz PCM16, sends binary frames; receives PCM frames + JSON events; jitter-buffered playback via `AudioContext`; `flush_playback` clears queue. UI shows live transcript, detected language, tool activity ("Checking Dr. Rao's slots…"), and the booking card when done.

### Web app (apps/web)

Public: `/` (hero, language marquee with real Sarvam clips, problem stats, live demo, how it works, languages, what it handles, who it's for, pricing, FAQ, CTA form), `/pricing`, `/faq`, `/privacy`, `/terms`, `/demo` (anonymous: scripted sample call; signed-in: real call on the demo clinic). Copy adapted from Svara to Muxaris; imagery from gpt-image-2 (`scripts/gen-assets.sh`), audio from Sarvam (`scripts/gen-audio.sh`).

Auth: Cognito via Amplify Auth (`aws-amplify/auth`) with **custom Muxaris-branded pages** (`/sign-in`, `/sign-up`, `/verify`, `/forgot-password`), "Continue with Google" through the Cognito hosted domain federation, SSR cookies via `@aws-amplify/adapter-nextjs`; `middleware.ts` protects `/app/**` and `/onboarding/**`; users with no membership are routed to `/onboarding`; a clinic switcher appears when a user has more than one membership.

Onboarding (`/onboarding`, 5 steps, resumable): clinic basics → doctors + hours → services + slot rules → assistant persona (name, greeting per language, voice, handoff number, FAQ) → review. "Load demo clinic" fills everything with Sunrise Dental Care so the first call works in under a minute. Ends on `/app/assistant/try`.

Dashboard (`/app`): overview (today's appointments, live/recent calls, KPIs), `calls` + `calls/[id]` (player with transcript sync, tools timeline, summary, outcome edit), `appointments` (day/week calendar, create/reschedule/cancel), `patients` + `patients/[id]`, `callbacks` (handoff queue), `assistant` (persona, languages, knowledge, test call), `analytics` (calls by outcome/language/hour, booking conversion, minutes used), `settings` (clinic, doctors, hours, services, team invitations + roles, notifications, plan/billing).

### API (apps/api, Hono)

`/v1/me` (user + memberships), `/v1/clinics` (create during onboarding), `/v1/clinics/:id/members` + `/invitations`, `/v1/doctors`, `/v1/services`, `/v1/slots?doctor&date&service`, `/v1/appointments` CRUD, `/v1/patients`, `/v1/calls`, `/v1/calls/:id/recording-url` (presigned S3), `/v1/callbacks`, `/v1/assistant`, `/v1/analytics/*`, `/v1/usage`, `/v1/notifications`, `/v1/onboarding/*`, `/v1/demo/seed`; public `/v1/demo-requests`; webhooks `/webhooks/razorpay`, `/webhooks/telephony/*`; `/healthz`. Cognito access token verified with `aws-jwt-verify` (user pool id + client id, JWKS cached); user upserted from `sub`/`email`; tenant taken from `X-Clinic-Id` and checked against `memberships`; every query scoped by `clinic_id`; role checks (`owner` for settings/billing/team). OpenAPI JSON at `/openapi.json`, typed client generated into `packages/shared`.

### Async workers

- **post-call** (SQS → Lambda): Bedrock (Sonnet 4.5) summary ≤60 words, outcome classification, sentiment, extracted entities; writes `calls`; creates `callbacks` if needed; enqueues confirmation notification.
- **notifier** (SQS → Lambda): provider interface `NotificationProvider { send(msg): Result }` with `SesEmailProvider` (live), `SnsSmsProvider` (behind `SMS_ENABLED`, DLT caveat documented), `WhatsAppCloudProvider` (behind `WHATSAPP_ENABLED`), `ConsoleProvider` (local). Idempotent on `notifications.id`.
- **reminders** (EventBridge 15-min cron → Lambda): appointments starting in 24h / 2h without a reminder → enqueue.

### Infra (infra/, CDK TypeScript)

Stacks: `Network` (VPC 2 AZ, public subnets for Fargate tasks with public IPs to avoid NAT cost; private isolated subnets for RDS), `Auth` (Cognito User Pool: email sign-in, required email verification, password policy, Google identity provider when secrets exist, hosted domain `auth.muxaris.com` or the Cognito prefix domain, app client with PKCE for the web, pre-sign-up/post-confirmation Lambda triggers for invitation acceptance and user upsert, custom email via SES once verified), `Data` (RDS Postgres 16 t4g.micro, S3 buckets with lifecycle, Secrets Manager secrets), `Services` (ECR ×2, ECS cluster, 2 Fargate services 0.5 vCPU/1 GB, ALB with host rules, ACM cert via DNS validation, autoscaling on CPU + ALB connections), `Workers` (3 Lambdas, 2 SQS + DLQs, EventBridge rule, Bedrock/SES/SNS IAM), `Observability` (log groups, CloudWatch dashboard: calls/min, STT/LLM/TTS latency p50/p95, errors; alarms → SNS email), `Cicd` (GitHub OIDC provider + deploy role). Migrations run as an ECS one-off task before service update (`scripts/migrate.sh`), not at container start.

CI/CD: GitHub Actions `ci.yml` (lint, typecheck, unit + integration tests with Postgres service container) on PRs; `deploy-aws.yml` on push to `main` (build images → ECR, `cdk deploy --all`, migrate, smoke). Netlify deploys `apps/web` on the same push.

Scripts: all AWS-touching scripts source `scripts/lib/aws-guard.sh`, which exports `AWS_PROFILE=aws-secondary-account`, `AWS_REGION=ap-south-1`, and exits non-zero if the caller identity account is not `005533348545`. `scripts/bootstrap-aws.sh` (runs the guard, `cdk bootstrap`, pushes `.env` secrets to Secrets Manager, deploys the `Auth` stack first so Cognito ids exist for local dev and Netlify, prints DNS/ACM/SES records to add at GoDaddy and the `NEXT_PUBLIC_*` values for Netlify), `scripts/dev.sh` (docker compose Postgres + all apps with one command), `scripts/seed.ts`, `scripts/smoke.sh` (health, auth'd API call, WS handshake), `scripts/gen-assets.sh`, `scripts/gen-audio.sh`.

## Execution method

**Sonnet subagents do the implementation work; I orchestrate.** Per the user's instruction, all implementation tasks are dispatched to `model: sonnet` subagents (subagent-driven development): I break each phase into self-contained tasks with exact file paths, interfaces, acceptance tests and the AWS-account guard; each subagent implements with TDD and reports back; I review the diff, run the verification, and dispatch fixes. Independent tasks (e.g. landing page vs. slot engine vs. CDK stacks) run in parallel subagents. Spikes, research and exploration also use Sonnet. I write the per-phase spec and plan documents myself, and I do the final verification and commits.

## Phased delivery

Each phase gets its own spec in `docs/superpowers/specs/` and plan in `docs/superpowers/plans/` (written via the writing-plans skill at the start of the phase), then TDD implementation, then a commit on a feature branch merged to `main`. Phase 1 is the first demoable vertical slice.

### Phase 0: Foundation and spikes
- Write `docs/superpowers/specs/2026-10-04-muxaris-platform-design.md` from this plan; commit.
- Scaffold npm-workspaces monorepo; delete Astro files; new `netlify.toml`; `.env.example`; `docker-compose.yml` (Postgres 16); shared eslint/tsconfig/prettier; Vitest.
- `packages/db` schema + first migration + demo seed (Sunrise Dental Care: Dr. Rao, Dr. Shetty, hours 10–20 Mon–Sat, 6 services, slot rules).
- **Spike scripts** (`scripts/spike/`): (a) Sarvam STT WS with `vad_signals=true` and `mode=codemix` on a Kannada/English WAV; (b) Sarvam TTS streaming: read `sarvamai` npm source for the WS client, confirm URL/schema, else REST fallback; (c) Bedrock `Converse` with tools against Haiku 4.5 in ap-south-1, `list-inference-profiles` first. Record findings in `docs/SPIKES.md`.
- Brand: Muxaris wordmark SVG + mark, design tokens, `gen-assets.sh` prompts; generate hero/section imagery and favicon set.

### Phase 1: Vertical slice (landing → sign-up → onboarding → first call → appointment on dashboard)
- `infra`: `Auth` stack deployed early (Cognito User Pool + client) so sign-up works locally against a real pool; this is the first AWS resource the project creates.
- `apps/web`: landing (all sections, Muxaris copy, generated assets), legal pages, Cognito auth pages (sign-up, verify code, sign-in, Google, forgot password) styled as Muxaris, onboarding wizard with demo seed, minimal dashboard (overview + appointments list), `/app/assistant/try` call page.
- `apps/api`: auth middleware (token verify, user upsert, membership check), clinics + memberships, doctors, services, slot engine (`packages/core/scheduling` with unit tests: hours, time-off, buffers, grain, lead time, conflicts), appointments CRUD, onboarding endpoints.
- `apps/voice-gateway`: session engine, Sarvam STT/TTS adapters, Bedrock adapter with the 9 tools, barge-in, usage caps, `calls`/`call_turns` persistence. Fake STT/TTS/LLM adapters for tests (drive a scripted conversation that books a slot).
- `packages/voice-sdk` + React `useVoiceCall` hook; call UI with transcript, tool activity, booking card.
- Local end-to-end verified in the browser.

### Phase 2: Call center
- Recorder → S3; transcript JSON; presigned playback; post-call Lambda (summary/outcome/sentiment) running locally via a `workers:dev` runner and in AWS via SQS.
- Dashboard: calls list with filters, call detail (player + synced transcript + tools timeline + summary), callbacks queue, outcome editing, overview KPIs.

### Phase 3: Patients, reminders, notifications
- Patients CRUD, auto-create from calls, language preference, visit history, no-show marking.
- Notification service + providers (SES live, SMS/WhatsApp flagged, console local), outbox UI, templates in 5 languages.
- Reminder Lambda + appointment reminder settings.

### Phase 4: Analytics, plans, billing
- Analytics queries + dashboard charts (dataviz skill), usage ledger, plan limits enforced in gateway and shown in settings.
- Razorpay subscription (Standard ₹4,999/mo) behind `BILLING_ENABLED`; webhook handler; pilot plan default.

### Phase 5: AWS deployment, CI/CD, telephony readiness, docs
- CDK stacks, bootstrap script, GitHub Actions OIDC deploy, CloudWatch dashboard + alarms, smoke tests on the live ALB/CloudFront URL, then custom domains once DNS is added.
- `TwilioMediaStreamTransport` + `/webhooks/telephony/twilio` (μ-law 8k transcoding) activated by env; Exotel adapter stub with documented steps.
- `docs/ARCHITECTURE.md`, `docs/AWS-SERVICES.md` (service → role → why, for the credits application), `docs/RUNBOOK.md`, README rewrite, `.env.example` complete.

## Reuse from svara-ai (fetch with `gh api` / scratchpad clone)
- `src/components/VoiceAgent.tsx`: mic capture, PCM framing, playback scheduling, barge-in UX → `packages/voice-sdk`.
- Receptionist system prompt and rules (no medical advice, emergencies → staff, ≤2 sentences, greeting) → `apps/voice-gateway/src/prompt.ts`, parameterised per clinic.
- `src/lib/content.ts` (steps, FAQs, languages, specialties) → `packages/shared/content.ts`, re-branded.
- `scripts/gen-audio.sh` (Sarvam bulbul TTS, speakers anushka/vidya) and `scripts/gen-image.sh` (gpt-image-2 via `GPT_IMAGE_ENDPOINT`) → `scripts/` with Muxaris copy (upgrade to `bulbul:v3`).
- `supabase/schema.sql` `demo_requests` shape → Drizzle table.
- Visual tokens (Fraunces/Inter, paper `#fafaf7`, ink `#0c1220`, green accent) as the starting palette.

## Known limits to document in the product and README
- Sarvam Starter plan: 20 concurrent STT sockets, 60 req/min REST; 429/503 backoff.
- Voice Agents platform pricing unverified; we only use core STT/TTS APIs (₹30/hr STT, ₹30/10K chars TTS).
- Indian SMS needs DLT; email is the live channel until WhatsApp Business is approved.
- Browser calls capped at 10 min; phone calls need a telephony account and KYC.

## Verification

- **Phase 0**: spike scripts print a Kannada transcript with VAD events, a TTS audio file that plays, and a Bedrock tool call round-trip in ap-south-1. `npm run build` passes for all workspaces; `docker compose up` + `npm run db:migrate && npm run db:seed` succeeds.
- **Phase 1**: unit tests for the slot engine and tool handlers; gateway integration test drives a scripted conversation through fake STT/LLM/TTS adapters and asserts an `appointments` row. Manual: `scripts/dev.sh`, sign up, run onboarding with demo data, open Try page, speak "I want a cleaning tomorrow afternoon", hear a reply, see the appointment on `/app/appointments`. Browser verification via the `browse` or Chrome tools.
- **Phase 2–4**: API integration tests against Postgres (service container in CI); worker tests with mocked Bedrock/SES; UI smoke via browser.
- **Phase 5**: `scripts/bootstrap-aws.sh` + GitHub Actions deploy from a clean account state; `scripts/smoke.sh` against live URLs (health, auth'd API call, WS handshake, one browser call from the Netlify-deployed site to the AWS gateway); CloudWatch dashboard shows the call; `docs/AWS-SERVICES.md` lists every service in use.
