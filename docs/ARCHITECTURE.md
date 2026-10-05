# Architecture

## Call pipeline

1. **Gateway** (`apps/voice-gateway`) runs the live call: speech in, speech out, tools.
2. **Recorder** mixes both sides into a stereo WAV, caller on the left channel and assistant on
   the right, 16 kHz. It is skipped when the clinic has `settings.recordCalls = false` (the
   transcript is still saved) or when storage is disabled.
3. **S3** receives the files when the call ends:
   `clinics/{clinicId}/calls/{callId}/recording.wav` and
   `clinics/{clinicId}/calls/{callId}/transcript.json`. Objects are encrypted (SSE-S3) and a
   lifecycle rule deletes them after 90 days. The call row tracks `recordingStatus`.
4. **SQS** gets a `call.completed` message from the gateway.
5. **Post-call worker** (`workers/post-call`) reads the turns and asks Amazon Nova Pro on Bedrock
   (`apac.amazon.nova-pro-v1:0`) for a summary, sentiment and entities. It writes
   `calls.summary`, `calls.sentiment` and `calls.analysis`, and may create a callback. Duplicate
   deliveries are no-ops. A stale-call sweep runs every minute and closes calls left in progress;
   the same job runs the retention purge, which blanks transcript text, tool payloads, summary and
   recording references 90 days after a call ends (`purgeExpiredCalls`).
6. **Dashboard** (`/app/calls`) lists calls, plays the recording through a short-lived presigned
   URL and shows the transcript in sync with the audio.

Per-clinic setting: `settings.recordCalls` (default on), changed by owners in Settings. The
opening note on every call always says an AI assistant is answering and the call is transcribed;
it says "recorded" only when recording is on for the clinic and storage is configured.

Turn times (`call_turns.started_at`) are stamped on the call clock by the gateway: the start of
speech for caller turns, the first audio chunk sent for assistant turns, the start of the tool call for
tools. `metrics.recorderT0Ms` is the recording's origin relative to the call start, so the
dashboard seeks with `turn - call.startedAt - recorderT0Ms`.

## Deployed topology

One AWS account (`005533348545`), one region (`ap-south-1`), nine CDK stacks. The web app is on
Netlify; DNS is at GoDaddy. See [AWS-SERVICES.md](AWS-SERVICES.md) for the service inventory and
[RUNBOOK.md](RUNBOOK.md) for operations.

```
 browser / Twilio
      |  https://api.muxaris.com   wss://voice.muxaris.com
      v
 ALB (public subnets, idle timeout 3600 s, 443 once CERT_ARN is set; 80 redirects)
   |- Host voice.muxaris.com, or path /v1/session*, /v1/telephony/*  -> gateway target group :4100
   '- everything else                                                  -> API target group :4000
 Fargate ARM64, public subnets with public IPs (no NAT on this path)
   |- api service     0.5 vCPU / 1 GB, 1 to 2 tasks (CPU 70%), stopTimeout 30 s
   '- gateway service 0.5 vCPU / 1 GB, exactly 1 task, stopTimeout 90 s
 Lambdas (private subnets, egress through one NAT): post-call, sweep, deliver, reminders
 RDS Postgres 16 (isolated subnets, no internet route); S3; SQS + DLQ; Secrets Manager
```

- **Network.** VPC `10.42.0.0/16` over two AZs with public, private-with-egress and isolated
  subnets and one NAT gateway. Security groups: the ALB admits 80 and 443 from anywhere; the
  services admit 4000 and 4100 from the ALB only; RDS admits 5432 from the services and the Lambdas
  only. Both services run in public subnets with public IPs so that they reach Sarvam, Bedrock, S3
  and Secrets Manager without a second NAT.
- **ALB and health checks.** Target groups are IP targets with `/healthz` health checks every 30 s.
  The gateway's deregistration delay is 90 s to match its `stopTimeout`. The gateway rules are
  priority 10 (host `voice.muxaris.com`) and 20 (the two path patterns); the API is the default.
  Until a certificate is attached the ALB serves HTTP only.
- **Deploys.** Both services use the ECS circuit breaker with rollback. The API runs 100% to 200%
  healthy; the gateway runs 0% to 100%, so a deploy never has two gateways and has a short gap.
- **Secrets.** Task definitions and Lambda environments hold only ARNs: `DB_SECRET_ARN`
  (`muxaris/db`, RDS-generated) and `APP_SECRET_ARN` (`muxaris/app`, JSON). At start, each process
  runs `applySecretsToEnv`, which builds `DATABASE_URL` from the first and copies every non-empty
  key of the second that is not already set into `process.env` (key names only are logged). The
  API, gateway, migrate task and all four Lambdas have read access to those two secrets and nothing
  else in Secrets Manager. `DATABASE_SSL=verify` is set everywhere.
- **Database encryption.** The instance has `storageEncrypted: true` and connections use TLS with
  the chain verified against the embedded RDS global CA bundle (`DATABASE_SSL=verify`;
  `DATABASE_SSL_CA` overrides it; refresh with `scripts/update-rds-ca.sh`). `no-verify` exists for
  debugging only.
- **Log groups** (one month): `/muxaris/api`, `/muxaris/voice-gateway`, `/muxaris/migrate`, and
  `/aws/lambda/...` for each function. The gateway writes JSON lines.
- **Metrics.** Namespace `Muxaris`, from metric filters on `/muxaris/voice-gateway`: `SttMs`,
  `LlmFirstTokenMs`, `TtsFirstAudioMs` (the values on the `turn` line), and the counts
  `CallsStarted` (`session accepted`), `CallsSettled` (`call settled`), `QuotaRejected`
  (`quota exhausted`), `BusyRejected` (`busy`) and `ProviderErrors` (`provider error` or
  `llm error`). Alarms (ALB 5xx, gateway CPU, Lambda errors, RDS CPU and free storage, DLQ depth)
  all go to the SNS topic `muxaris-alarms`; the `muxaris` dashboard graphs everything above.
- **Migrations** run as the one-off Fargate task `muxaris-migrate` (the API image with
  `node packages/db/dist/migrate.js`), started by `scripts/migrate.sh` locally and by the deploy
  workflow in CI.
- **Known limits.**
  - One gateway task: the per-process concurrency counters (`MAX_SESSIONS`, plan concurrency)
    cannot be shared, so the gateway does not scale out. See the runbook for what a shared store
    needs. A deploy also drops calls still running after the 90 s `stopTimeout`.
  - The Lambdas reach the internet (Bedrock, Secrets Manager, SES) through the single NAT gateway,
    in one AZ.
  - Indian SMS needs TRAI DLT registration, so SMS is implemented but off; email is the live
    channel.
  - Browser calls are capped at `MAX_CALL_SECONDS`, 1200 s (20 minutes).
  - Sarvam Starter allows 20 concurrent STT sockets and 60 REST requests per minute.
  - Phone calls need a Twilio number and KYC ([TELEPHONY.md](TELEPHONY.md)).

## Notifications

- **Outbox.** A booking, reschedule or cancellation writes `notifications` rows inside the same
  transaction, with the subject and body already rendered. The channel is chosen email, then
  WhatsApp, then SMS, according to the channel flags and what the patient has on file. When nothing
  is usable the row is written as `skipped` with error `no_contact`. A reschedule or cancellation
  first marks the appointment's still-queued rows `skipped` with error `superseded`, whether or not
  it writes a new message. Two skips happen at delivery time: `channel_disabled` when a channel flag
  was turned off after the row was queued, and `superseded` when the appointment is no longer active
  or has already started (cancellation notices are still sent).
- **Claim loop.** The notifier (`workers/notifier`) claims due rows with
  `FOR UPDATE SKIP LOCKED`, increments `attempts` and sends. A failure sets `next_attempt_at` five
  minutes ahead; after 5 attempts the row is `failed`. Delivery is at-least-once: a crash between
  send and the sent mark re-sends after 5 minutes. Staff can retry a failed or skipped row from the
  Notifications page; the retry renders the subject, body, language and recipient again from the
  appointment as it is now, and is refused (409) for a superseded row, an appointment that is no
  longer active (except a cancellation notice) or one whose time has passed.
- **Providers.** `NOTIFY_PROVIDER` is `console` (default when `NOTIFY_FROM_EMAIL` is unset) or `aws`
  (alias `ses`; default when `NOTIFY_FROM_EMAIL` is set). The console provider logs counts only,
  never recipients. Email uses `NOTIFY_FROM_EMAIL`. SMS (SNS) needs
  `SMS_ENABLED=1`; WhatsApp needs `WHATSAPP_ENABLED=1`, `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_ID`.
- **Reminders.** The reminder sweep queues a reminder 20 to 24 hours before and another 1 to 2
  hours before the appointment. The stamps are written in the same transaction as the outbox row,
  so a reminder is never queued twice; rescheduling clears the stamps and re-arms both. When a
  confirmation or reschedule message is actually queued, the same transaction sets the stamps it
  makes redundant (24 h when the visit is 24 hours away or less, 2 h when it is 2.5 hours away or
  less); a skipped or switched-off message sets none, so a patient whose email is added later still
  gets reminders. The 2-hour reminder also requires the booking to be at least 30 minutes old.
- **Clinic switches.** Owners can turn confirmations and reminders off per clinic in Settings;
  when a switch is off no row is written at all.
  Reminder stamps are still set, so the appointment is not re-examined when the switch is turned
  back on.
- **Retention.** The post-call sweep purges the contact number of closed callbacks 90 days after
  they close.
- **Audited reveals.** Phone numbers are masked in every response. Staff reveal a patient or
  callback number with `POST /v1/patients/:id/reveal-phone` and
  `POST /v1/callbacks/:id/reveal-phone`; each reveal is written to the audit log.

## Plans, usage and billing

- **Plans.** The `plans` table is seeded by migration 0005 from a single source, `PLAN_SEED`
  (`packages/db/src/seed-data.ts`). Each clinic has a `plan` (`pilot` or `standard`).
- **Usage ledger.** `usage_ledger` has one row per clinic and month (`clinic_id`, `month`,
  `call_seconds`, `calls`, `llm_input_tokens`, `llm_output_tokens`). It is written when a call
  settles and by the stale-call sweep, and keyed by the month the call started. `GET /v1/usage`
  returns it as `UsageSummary` together with the plan, included minutes and overage.
  Usage is recorded exactly once per call via `calls.usage_recorded_at` (claimed in the same
  transaction as the ledger upsert), and swept calls bill the time up to their last turn, never
  a fabricated maximum. Each swept row is its own transaction: one that fails rolls back, is
  counted in the sweep's `errors`, and never blocks the other rows. `billing_events` stores the
  subscription entity only, not the whole body.
- **Gateway rule.** A session is rejected at zero remaining plan seconds (close code 4029,
  `quota`). A call that has started is never cut off by the plan: it runs to `MAX_CALL_SECONDS`
  and the overage is recorded in the ledger. Concurrency is limited per plan, per process.
- **Pilot end.** Derived from `clinics.createdAt` plus 30 days (`pilotEndsAt`); displayed in
  Settings and not enforced.
- **Analytics.** `GET /v1/analytics/calls` and `GET /v1/analytics/usage` (members). Ranges are
  bucketed by the clinic's local day (`localDayWindow`) and capped at 92 days.
- **Billing.** Off unless `BILLING_ENABLED=1`. `GET /v1/billing` (members) returns whether billing
  is enabled, the public key id and the latest subscription. `POST /v1/billing/subscriptions`
  (owner only) starts a Standard subscription; a subscription still in `created` (checkout opened,
  never completed) is resumable and returns the same subscription without calling Razorpay, while
  `authenticated`, `active`, `pending` or `halted` raise 409. The Settings Plan section renders the
  Upgrade button, which loads `checkout.razorpay.com/v1/checkout.js` on demand.
- **Webhook.** `POST /webhooks/razorpay` is public, limited to 64 KB, and answers 404 when billing
  is disabled. The HMAC signature is verified over the raw body. Idempotency is keyed by the SHA-256
  of the signed raw body (Razorpay retries resend the identical body), stored as the
  `billing_events` id; the event-id header is not trusted because it is outside the HMAC. Authentic
  events with no subscription entity (`payment.*`, `order.*`) are answered 200
  `{"result":"ignored"}` and not stored. The plan is decided by the subscription entity status, not
  the event name, and updates `subscriptions` and the clinic plan in one transaction.
- **Audit actions.** `clinic.settings.edit`, `clinic.subscription.start`, `clinic.plan.change`.

## IAM (deployed)

What the stacks grant, per process. Every role is created by CDK; the deploy role is described last.

- **Gateway task:** `s3:PutObject` on the calls bucket objects, `sqs:SendMessage` on the post-call
  queue, `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream` on the Nova 2 Lite
  inference profile and foundation model, and read on the two secrets.
- **API task:** `s3:GetObject` (to presign recording URLs) and `s3:ListBucket` on the calls bucket
  (so that a missing object returns 404 instead of 403), and read on the two secrets. The billing
  values (`RAZORPAY_*`) come from `muxaris/app`; `/webhooks/razorpay` is reachable publicly through
  the ALB.
- **Post-call and sweep Lambdas:** `bedrock:InvokeModel` on the `apac.amazon.nova-pro-v1:0`
  inference profile and the underlying `amazon.nova-pro-v1:0` foundation-model ARN (any region the
  profile routes to), and read on the two secrets. The post-call function also consumes the queue
  (`sqs:ReceiveMessage`, `DeleteMessage`, `ChangeMessageVisibility`, `GetQueueAttributes`).
- **Notifier Lambdas (deliver, reminders):** `ses:SendEmail` and `ses:SendRawEmail` on the
  `muxaris.com` SES identity, `sns:Publish` only when the stack is deployed with `SMS_ENABLED=1`,
  and read on the two secrets.
- **Migrate task:** its own task and execution roles (`muxaris-migrate-task`,
  `muxaris-migrate-exec`) with read on the two secrets.
- **EventBridge schedules:** `deliverHandler` every minute, `remindersHandler` every 15 minutes,
  `sweepHandler` (stale-call sweep and retention purge) every 15 minutes.
- **Queue wiring:** the SQS event source sets `ReportBatchItemFailures` (batch size 5, window 5 s),
  and the queue's dead-letter queue is alarmed.
- **Deploy role `MuxarisGithubDeploy`:** assumed through GitHub OIDC for `main` of the repository
  only (no stored keys). It can push and pull the two ECR repositories, assume the CDK bootstrap
  roles, run the `muxaris-migrate` task on the `muxaris` cluster (with `iam:PassRole` for its two
  roles), read the migrate log group, and describe CloudFormation stacks.
- **Concurrency counters:** still per process; they need a shared store before more than one
  gateway task can run (see the runbook).

## Operations notes

- The stale-call sweep and the retention purge run in the `sweepHandler` Lambda on an EventBridge
  schedule every 15 minutes (the local worker still runs them every minute). Closed: the earlier
  carry-over that they only ran where the worker ran.
- The gateway task has `stopTimeout` 90 s and the ALB deregistration delay matches it, so a deploy
  gives in-flight recording uploads and calls time to finish. Closed: the earlier carry-over to set
  `stopTimeout`. A call still running after 90 s is cut by a deploy.
- The post-call SQS mapping reports batch item failures, so one bad message no longer retries the
  whole batch. Closed.
- Drizzle applies all pending migrations in a single transaction. On a fresh database a later
  migration must not use the `'abandoned'` call status in the same run as migration 0003, which
  adds it (Postgres cannot use a new enum value in the transaction that created it).
