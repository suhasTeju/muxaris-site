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
speech for caller turns, the first audio chunk sent for assistant turns, the start of the call for
tools. `metrics.recorderT0Ms` is the recording's origin relative to the call start, so the
dashboard seeks with `turn - call.startedAt - recorderT0Ms`.

## Phase 5 IAM

- **Gateway:** `s3:PutObject` on the calls bucket and `sqs:SendMessage` on the post-call queue.
- **API:** `s3:GetObject` (to presign recording URLs) and `s3:ListBucket`, so that a missing
  object returns 404 instead of 403.
- **Worker:** `sqs:ReceiveMessage`, `sqs:DeleteMessage` and `sqs:ChangeMessageVisibility` on the
  queue, and `bedrock:InvokeModel` on both the `apac.amazon.nova-pro-v1:0` inference profile and
  the underlying foundation-model ARNs in each region the profile routes to.
- The event-source mapping must set `ReportBatchItemFailures` (the handler returns
  `batchItemFailures`). Add a CloudWatch alarm on the dead-letter queue depth.

## Operations notes

- The stale-call sweep and the retention purge only run where the worker runs. In Phase 5 add an
  EventBridge schedule that invokes `sweepHandler` (it runs both).
- A deploy aborts in-flight recording uploads after about 10 s, so set the ECS task
  `stopTimeout` above the longest expected upload time.
- Drizzle applies all pending migrations in a single transaction. On a fresh database a later
  migration must not use the `'abandoned'` call status in the same run as migration 0003, which
  adds it (Postgres cannot use a new enum value in the transaction that created it).
