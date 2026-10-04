# Phase 2: Call Centre Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every call is recorded to S3 as a stereo WAV with a transcript JSON, summarised by a post-call worker (Amazon Nova Pro on Bedrock), and shown in a call-centre UI with player, synced transcript, tools timeline, outcome editing and a callbacks queue.

**Architecture:** A `Recorder` inside the voice gateway taps the caller (16 kHz) and assistant (24 kHz, downsampled) PCM streams onto one 16 kHz timeline, spools to temp files, and on call end streams a stereo WAV plus a transcript JSON to S3 through a new `@muxaris/storage` package, then enqueues a `call.completed` message on SQS. A `workers/post-call` package consumes the queue (locally via `npm run workers:dev`, as a Lambda in Phase 5), asks Nova Pro for a ≤60-word summary, sentiment, entities and an outcome refinement, and writes them back through new core services. The API gains filtered call listing, presigned recording URLs, outcome editing with audit, callbacks and overview stats; the web app gains the calls UI. Bucket and queues are created now by a small CDK `StorageStack` in the secondary account.

**Tech Stack:** TypeScript ESM (NodeNext, `.js` suffixes), npm workspaces, Drizzle + pg (migration 0003), Hono + zod v4, Node `ws` gateway, `@aws-sdk/client-s3` + `@aws-sdk/lib-storage` + `@aws-sdk/s3-request-presigner` + `@aws-sdk/client-sqs` + `@aws-sdk/client-bedrock-runtime` (all `^3.1146.0`), aws-cdk-lib 2.272, Next 16 App Router, Vitest 3.

**Spec:** `docs/superpowers/specs/2026-10-04-muxaris-platform-design.md` (Phase 2 at l.187–189; recorder l.129; post-call worker l.152; API l.148; data model l.108–113). Phase 1 facts this plan builds on are quoted inline per task.

## Global Constraints

- AWS: only account `005533348545`, region `ap-south-1`, profile `aws-secondary-account`; every AWS-touching script sources `scripts/lib/aws-guard.sh`; CDK `env` pinned to `ENV` from `infra/lib/config.ts`.
- Bedrock: Amazon Nova only. Worker model id `apac.amazon.nova-pro-v1:0` (env `POST_CALL_MODEL_ID`); never an Anthropic model id anywhere, including docs and comments.
- Secrets only in `.env` / Secrets Manager; never commit `.env`; never print env values.
- Logs never contain tokens, transcripts, phone numbers, patient names, tool inputs or S3 presigned URLs. Log ids, counts, durations, error names/codes only.
- Tenancy: every new query scoped by `clinic_id`; cross-tenant ids → `CoreError("not_found")`; S3 keys are `clinics/{clinicId}/calls/{callId}/…` and the API presigns only keys it derived from a row owned by the active clinic.
- Code style: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` (spread optionals as `...(x ? { x } : {})`), ESLint `no-explicit-any` is an error, prettier `{ printWidth: 100, trailingComma: "all" }`. Relative imports end in `.js`.
- Tests: Vitest; Postgres-dependent suites probe reachability and `describe.skip` when unreachable (`packages/core/src/services/test-support.ts` has `openDb`, `dbReachable`, `makeTestClinic`). AWS clients are injectable; tests use the in-memory fakes from `@muxaris/storage/fakes` — never real AWS.
- Copy honesty: the web app and the spoken disclosure may say "recorded" only once Task 3 ships; recordings and transcripts are kept 90 days by default (S3 lifecycle, Task 1) and the privacy page says exactly that.
- Commit trailer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; `git add` explicit files only; never `git add -f` anything under `.superpowers/`.
- Build order: `npm run build:packages` (shared → db → core → voice-sdk → **storage**, added in Task 1) before apps and workers; `pretest`/`pretypecheck` already run it.

## Review Focus

1. A call that ends during a gateway shutdown or socket drop (status `failed`, zero user turns) must still finish cleanly: no recording upload attempt for an empty timeline, `recording_status = "none"`, no queue message, no worker run — Task 3 test "abandoned call records nothing"; Task 4 test "worker skips calls without user turns".
2. A 20-minute call must not hold its audio in memory: the recorder spools every 30 s to temp files and streams the WAV upload; a reviewer should see bounded buffers — Task 3 test "spools after 30 s with silence padding" plus the memory assertion.
3. Replayed or duplicate SQS messages (at-least-once delivery) must not create duplicate callbacks or overwrite a staff-edited outcome — Task 4 tests "second delivery is a no-op" and "staff outcome is never overwritten".
4. A presigned URL request for another clinic's call id must return 404, not a URL, and URLs must expire — Task 5 test "recording-url cross-tenant → 404" and "presign ttl is 600 s".
5. A clinic with recording switched off (`clinics.settings.recordCalls === false`) must still get transcripts and summaries, and the disclosure must say "transcribed" only — Task 3 test "recordCalls false: transcript yes, WAV no, disclosure without 'recorded'".

---

### Task 1: `@muxaris/storage` package and the CDK StorageStack

**Files:**
- Create: `packages/storage/package.json`, `packages/storage/tsconfig.json`, `packages/storage/tsconfig.build.json` (if the other packages use one — follow `packages/core`), `packages/storage/vitest.config.ts`, `packages/storage/src/index.ts`, `packages/storage/src/blob-store.ts`, `packages/storage/src/queue.ts`, `packages/storage/src/keys.ts`, `packages/storage/src/fakes.ts`, `packages/storage/src/keys.test.ts`, `packages/storage/src/fakes.test.ts`
- Create: `packages/shared/src/jobs.ts` (message schema), export from `packages/shared/src/index.ts`
- Create: `infra/lib/storage-stack.ts`, `infra/test/storage-stack.test.ts`
- Modify: `infra/bin/muxaris.ts` (instantiate `StorageStack`), `infra/package.json` (script `deploy:storage`), root `package.json` (`build:packages` adds `-w @muxaris/storage` after voice-sdk), `.env.example` (keys below)

**Interfaces:**
- Produces (`@muxaris/storage`):
  ```ts
  export interface BlobStore {
    put(key: string, body: Buffer | Readable, contentType: string, contentLength?: number): Promise<void>;
    presignGet(key: string, ttlSeconds: number): Promise<string>;
    head(key: string): Promise<{ size: number } | null>;
    delete(key: string): Promise<void>;
  }
  export function createS3BlobStore(opts: { bucket: string; region: string; client?: S3Client }): BlobStore;
  export interface JobQueue<T> {
    send(msg: T): Promise<void>;
    receive(opts: { max: number; waitSeconds: number }): Promise<Array<{ handle: string; body: T }>>;
    delete(handle: string): Promise<void>;
  }
  export function createSqsQueue<T>(opts: { url: string; region: string; parse: (raw: unknown) => T; client?: SQSClient }): JobQueue<T>;
  export const callKeys = { recording: (clinicId, callId) => `clinics/${clinicId}/calls/${callId}/recording.wav`, transcript: (clinicId, callId) => `clinics/${clinicId}/calls/${callId}/transcript.json` };
  // fakes.ts
  export class FakeBlobStore implements BlobStore { objects = new Map<string, { body: Buffer; contentType: string }>(); presigned: string[] = []; ... }
  export class FakeQueue<T> implements JobQueue<T> { sent: T[] = []; pending: T[] = []; deleted: string[] = []; ... }
  ```
- Produces (`@muxaris/shared`): `postCallMessageSchema = z.object({ type: z.literal("call.completed"), clinicId: z.string(), callId: z.string(), endedAt: z.string(), attempt: z.number().int().min(1).default(1) })`, `type PostCallMessage = z.infer<...>`.
- Produces (env): `CALLS_BUCKET`, `POST_CALL_QUEUE_URL`, `STORAGE_DISABLED` (`1` skips recording/queue entirely; tests and CI).

- [ ] **Step 1: Write the failing key and fake tests**

```ts
// packages/storage/src/keys.test.ts
import { describe, expect, it } from "vitest";
import { callKeys } from "./keys.js";
describe("callKeys", () => {
  it("namespaces by clinic then call", () => {
    expect(callKeys.recording("cl_a", "call_1")).toBe("clinics/cl_a/calls/call_1/recording.wav");
    expect(callKeys.transcript("cl_a", "call_1")).toBe("clinics/cl_a/calls/call_1/transcript.json");
  });
  it("rejects ids with slashes or dots", () => {
    expect(() => callKeys.recording("cl_a/../x", "call_1")).toThrow(/invalid id/);
  });
});
// packages/storage/src/fakes.test.ts
import { describe, expect, it } from "vitest";
import { FakeBlobStore, FakeQueue } from "./fakes.js";
describe("fakes", () => {
  it("blob store round-trips and presigns", async () => {
    const s = new FakeBlobStore();
    await s.put("k", Buffer.from("abc"), "audio/wav");
    expect((await s.head("k"))?.size).toBe(3);
    expect(await s.presignGet("k", 600)).toMatch(/^fake:\/\/k\?ttl=600/);
    await s.delete("k");
    expect(await s.head("k")).toBeNull();
  });
  it("queue delivers once per receive and deletes by handle", async () => {
    const q = new FakeQueue<{ n: number }>();
    await q.send({ n: 1 });
    const [m] = await q.receive({ max: 10, waitSeconds: 0 });
    expect(m?.body.n).toBe(1);
    await q.delete(m!.handle);
    expect(await q.receive({ max: 10, waitSeconds: 0 })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail** — `cd packages/storage && npx vitest run` → FAIL (module not found).

- [ ] **Step 3: Create the package**

`packages/storage/package.json` (mirror `packages/core`): name `@muxaris/storage`, `"type":"module"`, `"sideEffects": false`, exports `.` → `dist/index.js` and `./fakes` → `dist/fakes.js`, scripts `build`/`typecheck`/`test`, dependencies `@aws-sdk/client-s3`, `@aws-sdk/lib-storage`, `@aws-sdk/s3-request-presigner`, `@aws-sdk/client-sqs` (all `^3.1146.0`), `zod ^4`.

```ts
// keys.ts
const ID = /^[a-z]+_[0-9a-z]{6,32}$/;
function assertId(id: string): string { if (!ID.test(id)) throw new Error("invalid id"); return id; }
export const callKeys = {
  recording: (clinicId: string, callId: string) => `clinics/${assertId(clinicId)}/calls/${assertId(callId)}/recording.wav`,
  transcript: (clinicId: string, callId: string) => `clinics/${assertId(clinicId)}/calls/${assertId(callId)}/transcript.json`,
};
// blob-store.ts
import { S3Client, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Readable } from "node:stream";
export interface BlobStore { /* as in Interfaces */ }
export function createS3BlobStore(opts: { bucket: string; region: string; client?: S3Client }): BlobStore {
  const client = opts.client ?? new S3Client({ region: opts.region });
  return {
    async put(key, body, contentType, contentLength) {
      if (Buffer.isBuffer(body)) {
        await client.send(new PutObjectCommand({ Bucket: opts.bucket, Key: key, Body: body, ContentType: contentType }));
        return;
      }
      await new Upload({ client, params: { Bucket: opts.bucket, Key: key, Body: body, ContentType: contentType, ...(contentLength ? { ContentLength: contentLength } : {}) }, queueSize: 2, partSize: 8 * 1024 * 1024 }).done();
    },
    presignGet: (key, ttlSeconds) => getSignedUrl(client, new GetObjectCommand({ Bucket: opts.bucket, Key: key }), { expiresIn: ttlSeconds }),
    async head(key) {
      try { const r = await client.send(new HeadObjectCommand({ Bucket: opts.bucket, Key: key })); return { size: r.ContentLength ?? 0 }; }
      catch (e) { if ((e as { name?: string }).name === "NotFound" || (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null; throw e; }
    },
    async delete(key) { await client.send(new DeleteObjectCommand({ Bucket: opts.bucket, Key: key })); },
  };
}
// queue.ts
import { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand } from "@aws-sdk/client-sqs";
export interface JobQueue<T> { /* as in Interfaces */ }
export function createSqsQueue<T>(opts: { url: string; region: string; parse: (raw: unknown) => T; client?: SQSClient }): JobQueue<T> {
  const client = opts.client ?? new SQSClient({ region: opts.region });
  return {
    async send(msg) { await client.send(new SendMessageCommand({ QueueUrl: opts.url, MessageBody: JSON.stringify(msg) })); },
    async receive({ max, waitSeconds }) {
      const r = await client.send(new ReceiveMessageCommand({ QueueUrl: opts.url, MaxNumberOfMessages: Math.min(10, max), WaitTimeSeconds: waitSeconds }));
      const out: Array<{ handle: string; body: T }> = [];
      for (const m of r.Messages ?? []) {
        if (!m.ReceiptHandle || !m.Body) continue;
        try { out.push({ handle: m.ReceiptHandle, body: opts.parse(JSON.parse(m.Body)) }); }
        catch { await client.send(new DeleteMessageCommand({ QueueUrl: opts.url, ReceiptHandle: m.ReceiptHandle })); } // poison message: drop
      }
      return out;
    },
    async delete(handle) { await client.send(new DeleteMessageCommand({ QueueUrl: opts.url, ReceiptHandle: handle })); },
  };
}
```

`fakes.ts`: `FakeBlobStore` stores Buffers (collect a `Readable` into a Buffer with `for await`), `presignGet` returns `fake://${key}?ttl=${ttl}` and pushes to `presigned`; `FakeQueue` moves `send` → `pending`, `receive` returns up to `max` with handles `h-${n}` and keeps them in `inflight` until `delete`; a second `receive` without `delete` returns the same messages again (at-least-once semantics for Task 4's duplicate test; add `redeliver()` to put inflight back to pending).

`packages/shared/src/jobs.ts` with `postCallMessageSchema` as in Interfaces.

- [ ] **Step 4: Run tests** — `npx vitest run` in `packages/storage` → PASS; `npm run build:packages` at root builds storage last.

- [ ] **Step 5: Write the failing CDK test**

```ts
// infra/test/storage-stack.test.ts
import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { StorageStack } from "../lib/storage-stack.js";
describe("StorageStack", () => {
  const t = Template.fromStack(new StorageStack(new App(), "T", { env: { account: "005533348545", region: "ap-south-1" } }));
  it("private, encrypted, versioned-off bucket with 90-day expiry on clinics/", () => {
    t.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
      BucketEncryption: { ServerSideEncryptionConfiguration: [{ ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } }] },
      LifecycleConfiguration: { Rules: [{ Prefix: "clinics/", ExpirationInDays: 90, Status: "Enabled", AbortIncompleteMultipartUpload: { DaysAfterInitiation: 2 } }] },
    });
  });
  it("post-call queue with a DLQ after 5 receives and 6-minute visibility", () => {
    t.resourceCountIs("AWS::SQS::Queue", 2);
    t.hasResourceProperties("AWS::SQS::Queue", { VisibilityTimeout: 360, RedrivePolicy: { maxReceiveCount: 5 } });
  });
  it("exports bucket name and queue url", () => {
    t.hasOutput("CallsBucketName", {}); t.hasOutput("PostCallQueueUrl", {});
  });
});
```

- [ ] **Step 6: Implement the stack**

```ts
// infra/lib/storage-stack.ts
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sqs from "aws-cdk-lib/aws-sqs";
import type { Construct } from "constructs";
import { PROJECT } from "./config.js";
export class StorageStack extends Stack {
  readonly callsBucket: s3.Bucket; readonly postCallQueue: sqs.Queue;
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);
    this.callsBucket = new s3.Bucket(this, "CallsBucket", {
      bucketName: `${PROJECT}-calls-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, encryption: s3.BucketEncryption.S3_MANAGED, enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [{ prefix: "clinics/", expiration: Duration.days(90), abortIncompleteMultipartUploadAfter: Duration.days(2) }],
      cors: [{ allowedMethods: [s3.HttpMethods.GET], allowedOrigins: ["https://muxaris.com", "https://www.muxaris.com", "http://localhost:3000"], allowedHeaders: ["*"], maxAge: 3600 }],
    });
    const dlq = new sqs.Queue(this, "PostCallDlq", { queueName: `${PROJECT}-post-call-dlq`, retentionPeriod: Duration.days(14) });
    this.postCallQueue = new sqs.Queue(this, "PostCallQueue", { queueName: `${PROJECT}-post-call`, visibilityTimeout: Duration.minutes(6), retentionPeriod: Duration.days(4), deadLetterQueue: { queue: dlq, maxReceiveCount: 5 } });
    new CfnOutput(this, "CallsBucketName", { value: this.callsBucket.bucketName });
    new CfnOutput(this, "PostCallQueueUrl", { value: this.postCallQueue.queueUrl });
  }
}
```
`infra/bin/muxaris.ts`: `new StorageStack(app, "MuxarisStorage", { env: ENV, description: "Muxaris call recordings bucket and post-call queue" });`. `infra/package.json`: `"deploy:storage": "bash scripts/cdk.sh deploy MuxarisStorage --require-approval never"`.

- [ ] **Step 7: Run infra tests and deploy** — `cd infra && npx vitest run` → PASS; `npm run deploy:storage -w infra` (guard enforces the secondary account). Copy the two outputs into `.env` as `CALLS_BUCKET=` and `POST_CALL_QUEUE_URL=`; add the keys with comments to `.env.example` (`STORAGE_DISABLED=` too, empty = enabled).

- [ ] **Step 8: Commit** — `git add packages/storage packages/shared/src/jobs.ts packages/shared/src/index.ts infra/lib/storage-stack.ts infra/test/storage-stack.test.ts infra/bin/muxaris.ts infra/package.json package.json package-lock.json .env.example && git commit -m "feat(storage): S3/SQS client package, call key layout and StorageStack"`.

---

### Task 2: Migration 0003 and core call-centre services

**Files:**
- Modify: `packages/db/src/schema/calls.ts` (new columns + enum), `packages/db/src/schema/misc.ts` (audit_log unchanged, confirm shape)
- Create: `packages/db/drizzle/0003_call_centre.sql` (hand-written, add to `drizzle/meta/_journal.json` the same way 0001/0002 were)
- Modify: `packages/core/src/services/calls.ts`, `packages/core/src/index.ts`
- Create: `packages/core/src/services/calls-centre.test.ts`
- Modify: `packages/shared/src/api.ts` (DTO fields + bodies), `packages/shared/src/api.test.ts`

**Interfaces:**
- Consumes: existing `createCall`, `appendTurn`, `finishCall`, `createCallback`, `assertCall`, `CoreError` codes (`not_found | conflict | forbidden | validation | slot_unavailable | clinic_limit`), `newId("aud")`.
- Produces (DB): `calls.recording_status text not null default 'none'` (`none | pending | ready | failed`), `calls.outcome_source text` (`gateway | worker | staff`, nullable), `calls.analysis jsonb` (`{ entities: {...}, needsCallback: boolean, callbackReason?: string, model: string }`), `calls.analysed_at timestamptz`, `calls.sentiment` stays text but only `positive | neutral | negative` are written; `callbacks.note text`, `callbacks.call_id` gets an index `callbacks_call_idx`.
- Produces (core):
  ```ts
  export type CallFilters = { from?: Date; to?: Date; outcome?: CallOutcome; status?: CallStatus; channel?: CallChannel; limit: number; offset: number };
  export function listCalls(db, clinicId, f: CallFilters): Promise<{ calls: CallRow[]; total: number }>;
  export function getCall(db, clinicId, callId): Promise<{ call: CallRow; turns: TurnRow[]; callbacks: CallbackRow[] }>;
  export function setCallRecording(db, { clinicId, callId, status: "pending"|"ready"|"failed"|"none", recordingS3Key?: string, transcriptS3Key?: string }): Promise<void>;
  export function updateCallAnalysis(db, { clinicId, callId, summary, sentiment, analysis, outcome?: CallOutcome, model: string }): Promise<{ applied: boolean }>;
    // writes summary/sentiment/analysis/analysed_at; sets outcome+outcome_source='worker' ONLY when current outcome_source is null or 'gateway' AND current outcome is null|'info'|'unknown'|'abandoned'; never touches a 'staff' outcome.
  export function setCallOutcomeByStaff(db, { clinicId, callId, outcome, actorUserId }): Promise<CallRow>; // outcome_source='staff' + audit_log row {action:'call.outcome.edit', entity:'call', entityId, data:{from,to}}
  export function getCallTranscript(db, clinicId, callId): Promise<TranscriptJson>;
    // TranscriptJson = { callId, clinicId, startedAt, endedAt, language, turns: Array<{ seq, role, text?, toolName?, offsetMs }> } — offsetMs = startedAt(turn) − startedAt(call), tool rows carry toolName only (no args/results)
  export function listCallbacks(db, clinicId, { status: "open"|"done"|"all", callId?: string, limit, offset }): Promise<{ callbacks: Array<CallbackRow & { phoneMasked: string }>; total: number }>;
    // phoneMasked uses @muxaris/shared maskPhone ("+91 •••• ••3210"); callId narrows to one call's callbacks (used by the worker's duplicate guard)
  export function updateCallback(db, { clinicId, callbackId, status?: "open"|"done", assignedTo?: string|null, note?: string }): Promise<CallbackRow>;
  export function getOverviewStats(db, clinicId, { dayStart: Date; dayEnd: Date }): Promise<{ callsToday: number; bookedToday: number; openCallbacks: number; avgDurationS: number | null; byOutcome: Record<string, number> }>;
  ```
  Also the gateway's `finishCall` keeps setting `outcome`; add `outcomeSource: "gateway"` in `finishCall` when an outcome is provided.
- Produces (shared): `Call` DTO gains `recordingStatus`, `outcomeSource`, `analysis`, `analysedAt`; new `Callback` DTO `{ id, clinicId, callId, patientId, phoneMasked, reason, priority, status, assignedTo, note, createdAt, doneAt }` (never the raw phone); bodies `callOutcomeBody = z.object({ outcome: callOutcomeEnum })`, `callbackPatchBody = z.object({ status: z.enum(["open","done"]).optional(), assignedTo: z.string().max(64).nullable().optional(), note: z.string().trim().max(500).optional() }).refine(b => Object.keys(b).length > 0)`, `callsQuery = { from?, to?, outcome?, status?, channel?, limit (1..200 default 50), offset }`.

- [ ] **Step 1: Write the migration and schema**

```sql
-- packages/db/drizzle/0003_call_centre.sql
ALTER TABLE calls ADD COLUMN recording_status text NOT NULL DEFAULT 'none';
ALTER TABLE calls ADD CONSTRAINT calls_recording_status_chk CHECK (recording_status IN ('none','pending','ready','failed'));
ALTER TABLE calls ADD COLUMN outcome_source text;
ALTER TABLE calls ADD CONSTRAINT calls_outcome_source_chk CHECK (outcome_source IS NULL OR outcome_source IN ('gateway','worker','staff'));
ALTER TABLE calls ADD COLUMN analysis jsonb;
ALTER TABLE calls ADD COLUMN analysed_at timestamptz;
ALTER TABLE calls ADD CONSTRAINT calls_sentiment_chk CHECK (sentiment IS NULL OR sentiment IN ('positive','neutral','negative'));
ALTER TABLE callbacks ADD COLUMN note text;
CREATE INDEX IF NOT EXISTS callbacks_call_idx ON callbacks (call_id);
CREATE INDEX IF NOT EXISTS calls_clinic_outcome_idx ON calls (clinic_id, outcome);
```
Mirror in `schema/calls.ts` (`recordingStatus: text("recording_status").notNull().default("none")`, etc.). Append the journal entry; run `npm run db:migrate` locally (and `npm run db:generate` only to confirm it reports no diff — do not commit a generated duplicate).

- [ ] **Step 2: Write the failing core tests** (Postgres-gated with `openDb`/`makeTestClinic`)

```ts
// packages/core/src/services/calls-centre.test.ts — key cases
it("listCalls filters by outcome and returns total", async () => { /* create 3 calls: booked, info, booked; finishCall each; expect listCalls(outcome:'booked').total === 2 and order startedAt desc */ });
it("getCall returns turns ordered and the call's callbacks; cross-tenant → not_found", ...);
it("updateCallAnalysis refines only gateway outcomes", async () => {
  // call A finished outcome 'info' source gateway → worker 'callback' applies, outcome_source 'worker'
  // call B finished outcome 'booked' → worker 'info' does NOT change outcome, summary still written
  // call C staff-edited to 'handoff' → worker result leaves outcome and source untouched
});
it("setCallOutcomeByStaff writes an audit_log row with from/to", ...);
it("getCallTranscript strips tool args and computes offsets", ...);
it("listCallbacks masks phone and counts open ones; updateCallback done sets doneAt", ...);
it("getOverviewStats counts calls and bookings inside the day window only", ...);
```

- [ ] **Step 3: Run to verify they fail**, then **Step 4: implement** the functions in `calls.ts` (Drizzle `and(eq(calls.clinicId, clinicId), …)`, `sql<number>\`count(*)\`` for totals, `inArray` for outcome guard, a transaction for `setCallOutcomeByStaff` + audit insert). `updateCallAnalysis` guard in SQL:
```ts
.set({ summary, sentiment, analysis, analysedAt: new Date(), ...(outcome ? { outcome: sql`CASE WHEN outcome_source IS DISTINCT FROM 'staff' AND (outcome IS NULL OR outcome IN ('info','unknown','abandoned')) THEN ${outcome}::call_outcome ELSE outcome END`, outcomeSource: sql`CASE WHEN outcome_source IS DISTINCT FROM 'staff' AND (outcome IS NULL OR outcome IN ('info','unknown','abandoned')) THEN 'worker' ELSE outcome_source END` } : {}) })
.where(and(eq(calls.id, callId), eq(calls.clinicId, clinicId)))
```

- [ ] **Step 5: Run core + shared + db tests → PASS; root typecheck.**
- [ ] **Step 6: Commit** — `git add packages/db packages/core/src/services/calls.ts packages/core/src/services/calls-centre.test.ts packages/core/src/index.ts packages/shared/src/api.ts packages/shared/src/api.test.ts && git commit -m "feat(core,db): call-centre columns, call listing, analysis write-back, callbacks and stats"`.

---

### Task 3: Gateway recorder, transcript upload, queue message, disclosure

**Files:**
- Create: `apps/voice-gateway/src/session/recorder.ts`, `apps/voice-gateway/src/session/recorder.test.ts`, `apps/voice-gateway/src/session/wav.ts` (header + interleave helpers), `apps/voice-gateway/src/post-call.ts` (upload + enqueue orchestration), `apps/voice-gateway/src/post-call.test.ts`
- Modify: `apps/voice-gateway/src/session/voice-session.ts` (recorder taps; `recordCalls` flag; disclosure variant), `apps/voice-gateway/src/session/prompt.ts` (`DISCLOSURE_RECORDED` strings), `apps/voice-gateway/src/server.ts` (`settle` → post-call pipeline; `recording_status` pending at start), `apps/voice-gateway/src/env.ts` (`callsBucket`, `postCallQueueUrl`, `storageDisabled`), `apps/voice-gateway/package.json` (`@muxaris/storage`), `apps/voice-gateway/src/server.test.ts`, `.env.example` comment
- Modify: `scripts/e2e-voice.ts` (assert `recordingStatus === "ready"` and transcript key present after `ended`, poll up to 20 s)

**Interfaces:**
- Consumes: `MediaTransport.onInboundAudio(cb(pcm16k))`, `transport.sendAudio(pcm24k)` call site in `pump()` (voice-session.ts l.594), `finish()` (l.402–453), `settle(finishRow)` in server.ts (l.529), `setCallRecording`, `getCallTranscript` (Task 2), `BlobStore`, `JobQueue<PostCallMessage>`, `callKeys` (Task 1).
- Produces:
  ```ts
  // recorder.ts
  export class Recorder {
    constructor(opts: { sampleRate?: 16000; spoolDir: string; spoolEveryMs?: number /* default 30_000 */; now?: () => number });
    caller(pcm16k: Buffer): void;      // left channel, 16 kHz
    assistant(pcm24k: Buffer): void;   // right channel, downsampled 24k→16k (stateful 3:2 decimation with linear interpolation)
    async finish(): Promise<{ wavPath: string; durationMs: number; bytes: number } | null>; // null when both tracks are empty
    async discard(): Promise<void>;    // removes spool files
  }
  // Timeline rule: each chunk is placed at sample index round((now() − t0) / 1000 * 16000) on its track; gaps are zero-filled; overlapping chunks (late arrival) append after the track's current end instead of overwriting.
  // Spool rule: every spoolEveryMs, each track flushes its completed samples to `${spoolDir}/${id}.L.raw` / `.R.raw`; memory per track ≤ spoolEveryMs of audio (≈ 960 KB).
  // finish(): pads the shorter track with zeros to the longer, streams L/R raw files interleaved into `${spoolDir}/${id}.wav` with a 44-byte header (PCM16, 2 ch, 16 kHz), deletes raw files, returns the path (caller deletes after upload).
  // post-call.ts
  export async function completeCall(deps: { db; blobs: BlobStore | null; queue: JobQueue<PostCallMessage> | null; log }, args: { clinicId; callId; recorder: Recorder | null; endedAt: Date; userTurns: number }): Promise<void>;
  // 1. if userTurns === 0: recorder?.discard(); setCallRecording status 'none'; return (no queue).
  // 2. transcript = getCallTranscript → blobs.put(transcriptKey, JSON, "application/json")
  // 3. if recorder: r = await recorder.finish(); if r: stream fs.createReadStream(wavPath) → blobs.put(recordingKey, stream, "audio/wav", r.bytes); unlink; setCallRecording ready with both keys; else status 'none' with transcriptKey.
  // 4. on any error: setCallRecording failed (keep transcriptKey if uploaded); log { callId, err: name }; continue.
  // 5. queue?.send({ type: "call.completed", clinicId, callId, endedAt, attempt: 1 }).
  // All steps bounded by a 60 s overall timeout; never throws to the caller.
  ```
- Disclosure: `prompt.ts` exports `DISCLOSURE` (transcribed only, existing) and `DISCLOSURE_RECORDED` per language; `openingUtterances(assistant, clinic, language, { recorded: boolean })` picks one. Strings (controller-supplied, to be checked by a native reader before GA):
  - en-IN: "This call is answered by an AI assistant and may be recorded and transcribed."
  - hi-IN: "यह कॉल एक AI सहायक द्वारा उत्तर दी जा रही है और इसे रिकॉर्ड और ट्रांसक्राइब किया जा सकता है।"
  - kn-IN: "ಈ ಕರೆಗೆ AI ಸಹಾಯಕ ಉತ್ತರಿಸುತ್ತಿದೆ ಮತ್ತು ಇದನ್ನು ರೆಕಾರ್ಡ್ ಮತ್ತು ಲಿಪ್ಯಂತರ ಮಾಡಬಹುದು."
  - ta-IN: "இந்த அழைப்பிற்கு ஒரு AI உதவியாளர் பதிலளிக்கிறது; இது பதிவு செய்யப்பட்டு எழுத்துருவாக்கப்படலாம்."
  - te-IN: "ఈ కాల్‌కు ఒక AI సహాయకుడు సమాధానమిస్తున్నారు; ఇది రికార్డ్ చేయబడి, లిప్యంతరీకరించబడవచ్చు."
- `SessionContext` gains `recordCalls: boolean` (server reads `clinic.clinic.settings.recordCalls !== false && !env.storageDisabled`); when true the session constructs a `Recorder` (spoolDir `os.tmpdir()/muxaris-rec`) and taps both audio paths; `finish()` no longer closes the recorder — `settle` does, via `completeCall`, after `finishCall` has run.

- [ ] **Step 1: Write the failing recorder tests**

```ts
// recorder.test.ts — use a fake clock; helper tone(n, v) = Buffer of n int16 samples with value v
it("places caller and assistant chunks on one timeline with silence gaps", async () => {
  let t = 0; const r = new Recorder({ spoolDir: tmp, now: () => t });
  r.caller(tone(1600, 1000));           // 100 ms at t=0
  t = 500; r.assistant(tone(2400 * 3, 2000)); // 300 ms of 24k at t=500 → 4800 samples at 16k
  t = 1000; const out = await r.finish();
  const { left, right } = readWav(out!.wavPath);
  expect(left.length).toBe(right.length);
  expect(left.slice(0, 1600).every((s) => s === 1000)).toBe(true);
  expect(left.slice(1600, 8000).every((s) => s === 0)).toBe(true);   // gap, then padding
  expect(right.slice(8000, 8000 + 4800).every((s) => s === 2000)).toBe(true);
  expect(out!.durationMs).toBe(800);  // longest track end = 500 ms + 300 ms
});
it("spools after 30 s with silence padding and keeps memory bounded", async () => { /* feed 61 s of caller audio in 20 ms frames; assert raw file size after 60 s ≥ 60*16000*2 bytes and recorder.bufferedBytes < 1_000_000 */ });
it("downsamples 24k to 16k statefully (no drift across chunk boundaries)", () => { /* 1 s of 24k in 7 odd-sized chunks → exactly 16000 samples (±1) */ });
it("finish on empty recorder returns null and leaves no files", ...);
it("overlapping late chunk is appended, not overwritten", ...);
// wav.ts
it("writes a valid 44-byte header for 16 kHz stereo PCM16", ...);
```

- [ ] **Step 2: Run → FAIL. Step 3: implement `wav.ts` and `recorder.ts`** (see rules in Interfaces; downsampler: carry `phase` and `last` sample across calls; output count = floor((pending + 2*phase) / 3) style — write it once as a `Downsampler` class with a `push(pcm24k): Buffer` method and test it alone).

- [ ] **Step 4: Write the failing post-call tests** with `FakeBlobStore` + `FakeQueue` and a Postgres-gated call row: "uploads transcript and wav, marks ready, enqueues once"; "abandoned call records nothing"; "upload failure marks failed and still enqueues"; "recordCalls false: transcript yes, WAV no". **Step 5: implement `post-call.ts`.**

- [ ] **Step 6: Wire the session and server** — session: in `start()` tap `transport.onInboundAudio` → `this.recorder?.caller(pcm)`; in `pump()` after `transport.sendAudio(out)` → `this.recorder?.assistant(out)`; expose `session.recorder` and `session.userTurns`. Server: on `createCall` success and `recordCalls` → `setCallRecording({ status: "pending" })`; in `settle()`, after `recordCallUsage`, `void completeCall(...)` (do not await inside the socket close path; it has its own timeout). `env.ts`: `callsBucket = src.CALLS_BUCKET ?? ""`, `postCallQueueUrl = src.POST_CALL_QUEUE_URL ?? ""`, `storageDisabled = src.STORAGE_DISABLED === "1" || !callsBucket`; `createProviders` builds `blobs`/`queue` or `null`. Disclosure test: `ready.greeting` starts with the recorded variant when `recordCalls` is true. Server test: with fakes injected via `ServerDeps.storage?: { blobs, queue }`, a happy-path call leaves one transcript object, one WAV object and one queue message.

- [ ] **Step 7: Run gateway tests, root typecheck, eslint, prettier → PASS.** Run `bash scripts/e2e-voice.sh` once with real providers: the script now polls `GET /v1/calls/:id` after `ended` until `call.recordingStatus === "ready"` (≤ 20 s, fail otherwise) and asserts `call.transcriptS3Key` is set. The presigned-URL HEAD check is added in Task 7 once the Task 5 route exists.

- [ ] **Step 8: Commit** — `git add apps/voice-gateway/src/session/recorder.ts apps/voice-gateway/src/session/recorder.test.ts apps/voice-gateway/src/session/wav.ts apps/voice-gateway/src/post-call.ts apps/voice-gateway/src/post-call.test.ts apps/voice-gateway/src/session/voice-session.ts apps/voice-gateway/src/session/prompt.ts apps/voice-gateway/src/server.ts apps/voice-gateway/src/server.test.ts apps/voice-gateway/src/env.ts apps/voice-gateway/package.json package-lock.json .env.example scripts/e2e-voice.ts && git commit -m "feat(voice-gateway): stereo call recorder, transcript upload and post-call queue"`.

---

### Task 4: `workers/post-call` — analysis worker (local runner now, Lambda handler for Phase 5)

**Files:**
- Create: `workers/post-call/package.json` (name `@muxaris/worker-post-call`, deps `@muxaris/{core,db,shared,storage}`, `@aws-sdk/client-bedrock-runtime`, `zod`), `tsconfig.json`, `vitest.config.ts`, `src/analyse.ts`, `src/analyse.test.ts`, `src/prompt.ts`, `src/handler.ts`, `src/handler.test.ts`, `src/lambda.ts`, `src/dev.ts`, `src/env.ts`
- Modify: root `package.json` (`"workers:dev": "npm run dev -w @muxaris/worker-post-call"`, `build` includes the worker), `scripts/dev.sh` (start the worker alongside api/gateway when `POST_CALL_QUEUE_URL` is set), `.env.example` (`POST_CALL_MODEL_ID=apac.amazon.nova-pro-v1:0`), `README.md` (Scripts: workers:dev)

**Interfaces:**
- Consumes: `postCallMessageSchema`, `createSqsQueue`, `getCall`, `updateCallAnalysis`, `createCallback`, `listCallbacks` (Task 2), Bedrock `ConverseCommand` (non-streaming) with `inferenceConfig: { maxTokens: 400, temperature: 0.2 }`.
- Produces:
  ```ts
  // analyse.ts
  export const analysisSchema = z.object({
    summary: z.string().trim().min(1).max(600),       // ≤ 60 words enforced by wordCount check → truncate at 60 words
    sentiment: z.enum(["positive", "neutral", "negative"]),
    outcome: z.enum(["booked","rescheduled","cancelled","info","callback","handoff","abandoned","unknown"]),
    needsCallback: z.boolean(),
    callbackReason: z.string().trim().max(200).optional(),
    entities: z.object({ patientName: z.string().max(80).optional(), requestedService: z.string().max(80).optional(), requestedDate: z.string().max(40).optional(), language: z.string().max(10).optional() }),
  });
  export type Analysis = z.infer<typeof analysisSchema>;
  export interface Analyser { analyse(input: { turns: Array<{ role: "user"|"assistant"|"tool"; text?: string; toolName?: string }>; language: string; gatewayOutcome: string | null }): Promise<Analysis>; }
  export function createNovaAnalyser(opts: { modelId: string; region: string; client?: { send(cmd: unknown): Promise<unknown> } }): Analyser;
    // system prompt (prompt.ts): clinic receptionist call analyst; respond ONLY with JSON matching the schema; summary ≤ 60 words, third person, no phone numbers; outcome rules: keep gatewayOutcome if it is booked/rescheduled/cancelled; otherwise classify info|callback|handoff|abandoned.
    // parse: strip ```json fences, JSON.parse, analysisSchema.parse; on failure retry once with "Return valid JSON only."; then throw AnalysisError("unparseable").
  // handler.ts
  export async function processMessage(deps: { db; analyser: Analyser; log; now?: () => Date }, msg: PostCallMessage): Promise<"analysed" | "skipped_no_turns" | "skipped_already" | "failed">;
    // getCall → if turns with role user === 0 → "skipped_no_turns" (write analysed_at anyway so it is not retried)
    // if call.analysedAt and (now − analysedAt) < 24 h → "skipped_already"
    // analyse → updateCallAnalysis({ summary, sentiment, analysis: { entities, needsCallback, callbackReason, model }, outcome })
    // if needsCallback and listCallbacks(db, clinicId, { status: "all", callId, limit: 1, offset: 0 }).total === 0 → createCallback({ clinicId, callId, phone: call.callerPhone ?? "unknown", reason: callbackReason ?? "Follow-up requested", priority: "normal" })
    // errors → log { callId, err: name } and return "failed" (message stays on the queue for retry/DLQ)
  export async function runOnce(deps, queue: JobQueue<PostCallMessage>): Promise<number>; // receive(max 5, wait 20) → processMessage each → delete on any result except "failed"
  // lambda.ts: export const handler = async (event: { Records: Array<{ body: string; messageId: string }> }) => { for each record: processMessage; return { batchItemFailures: [...failed messageIds] } }
  // dev.ts: loop runOnce until SIGINT; logs counts only
  ```

- [ ] **Step 1: Write the failing analyser tests** (fake Bedrock client returning `{ output: { message: { content: [{ text }] } } }`): "parses fenced JSON", "truncates summary to 60 words", "retries once on invalid JSON then throws", "keeps booked outcome from the gateway even if the model says info" (enforced in code after parse, not only by prompt), "strips digits sequences ≥ 8 long from summary" (PII guard).
- [ ] **Step 2: Run → FAIL. Step 3: implement `prompt.ts`, `analyse.ts`.**
- [ ] **Step 4: Write the failing handler tests** (Postgres-gated; `FakeQueue`; stub analyser): "analyses, writes summary and creates one callback"; "second delivery is a no-op (skipped_already) and creates no second callback"; "staff outcome is never overwritten"; "worker skips calls without user turns and deletes the message"; "failed analysis leaves the message in flight".
- [ ] **Step 5: Implement `handler.ts`, `lambda.ts`, `dev.ts`, `env.ts`** (`POST_CALL_QUEUE_URL`, `POST_CALL_MODEL_ID` default `apac.amazon.nova-pro-v1:0`, `AWS_REGION`, `DATABASE_URL`). `dev.ts` must exit non-zero with a clear message when the queue URL is empty.
- [ ] **Step 6: Run worker tests, root typecheck/lint/prettier → PASS.** Start `npm run workers:dev` in a second terminal, run `bash scripts/e2e-voice.sh`, and confirm `GET /v1/calls/:id` shows a `summary` within 60 s (the e2e script polls for `analysedAt` when `E2E_EXPECT_SUMMARY=1`).
- [ ] **Step 7: Commit** — `git add workers/post-call package.json package-lock.json scripts/dev.sh .env.example README.md scripts/e2e-voice.ts && git commit -m "feat(worker): post-call analysis worker with Nova Pro, local runner and Lambda handler"`.

---

### Task 5: API — calls, recording URL, outcome edit, callbacks, overview stats

**Files:**
- Create: `apps/api/src/routes/calls.ts`, `apps/api/src/routes/calls.test.ts`, `apps/api/src/routes/callbacks.ts`, `apps/api/src/routes/callbacks.test.ts`, `apps/api/src/routes/stats.ts`, `apps/api/src/routes/stats.test.ts`
- Modify: `apps/api/src/routes/appointments.ts` (remove the two `/calls` handlers), `apps/api/src/app.ts` (mount `callRoutes(db, { blobs })`, `callbackRoutes(db)`, `statsRoutes(db)`), `apps/api/src/deps.ts`/`index.ts` (construct `blobs` from `CALLS_BUCKET` unless `STORAGE_DISABLED`), `apps/api/src/env.ts`, `apps/api/package.json` (`@muxaris/storage`)

**Interfaces:**
- Consumes: Task 2 services and shared bodies; `BlobStore.presignGet`/`head`; `requireClinic(db)` / `requireClinic(db, "owner")`; error envelope `{ error: { code, message } }`; `v("query", schema)`.
- Produces:
  - `GET /v1/calls?from&to&outcome&status&channel&limit&offset` → `{ calls: Call[], total }`
  - `GET /v1/calls/:id` → `{ call, turns, callbacks }`
  - `GET /v1/calls/:id/recording-url` → `{ url, expiresInS: 600 }`; 404 `not_found` when the call is another clinic's or `recordingStatus !== "ready"` (respond 409 `recording_pending` when `pending`, 404 when `none`/`failed`); when `blobs` is null → 503 `storage_unavailable`. Never log the URL.
  - `PATCH /v1/calls/:id` body `callOutcomeBody` → `{ call }` (any member; audit row carries the actor)
  - `GET /v1/callbacks?status=open|done|all&limit&offset` → `{ callbacks: Callback[], total }`; `PATCH /v1/callbacks/:id` body `callbackPatchBody` → `{ callback }`
  - `GET /v1/stats/overview?date=YYYY-MM-DD` (default: today in the clinic timezone) → `{ date, callsToday, bookedToday, openCallbacks, avgDurationS, byOutcome }`. Day window: write `dayWindow(date: string, timeZone: string): { dayStart: Date; dayEnd: Date }` in `stats.ts` using `Intl.DateTimeFormat(…, { timeZone, timeZoneName: "longOffset" })` to read the zone offset for that date and build `dayStart = new Date(\`${date}T00:00:00${offset}\`)`, `dayEnd = dayStart + 24 h`; unit-test it for `Asia/Kolkata` (+05:30).

- [ ] **Step 1: Write the failing route tests** (`createApp` with the dev verifier as in `routes.test.ts`; `FakeBlobStore`): list filters + total; cross-tenant `/calls/:id` → 404; recording-url states (ready → `fake://clinics/…?ttl=600`, pending → 409, none → 404, other clinic → 404, blobs null → 503); PATCH outcome → audit row exists; callbacks list masks phone (`+91 •••• ••3210`) and PATCH done sets `doneAt`; stats day window uses the clinic timezone (a call at 23:30 IST yesterday is excluded).
- [ ] **Step 2: Run → FAIL. Step 3: implement the three route files**, move `/calls` out of `appointments.ts`, mount in `app.ts` (no new middleware; reuse `member`). Presign only `call.recordingS3Key` (never a key from the request).
- [ ] **Step 4: api tests (now ~70), root typecheck, eslint, prettier → PASS. Step 5: Commit** — `git add apps/api/src/routes/calls.ts apps/api/src/routes/calls.test.ts apps/api/src/routes/callbacks.ts apps/api/src/routes/callbacks.test.ts apps/api/src/routes/stats.ts apps/api/src/routes/stats.test.ts apps/api/src/routes/appointments.ts apps/api/src/app.ts apps/api/src/env.ts apps/api/src/index.ts apps/api/package.json package-lock.json && git commit -m "feat(api): call centre routes — filters, recording URL, outcome edit, callbacks, overview stats"`.

---

### Task 6: Web — calls list filters, call detail with player, callbacks queue, overview KPIs

**Files:**
- Modify: `apps/web/src/app/(app)/app/calls/page.tsx`, `apps/web/src/components/app/CallsBrowser.tsx`, `apps/web/src/components/app/CallList.tsx`, `apps/web/src/app/(app)/app/calls/[id]/page.tsx`, `apps/web/src/app/(app)/app/page.tsx` (KPIs from `/v1/stats/overview`), `apps/web/src/components/app/Sidebar.tsx` (Callbacks link with open count badge), `apps/web/src/lib/dashboard.ts` (`maskPhone` now delegates to `@muxaris/shared`'s `maskPhone` — one implementation), `apps/web/src/lib/call-errors.ts` (unchanged)
- Create: `apps/web/src/components/app/CallFilters.tsx`, `apps/web/src/components/app/CallPlayer.tsx` (client: fetches `/v1/calls/:id/recording-url` on mount, `<audio controls preload="none">`, re-fetches the URL on 403/expiry, emits `currentTimeMs`), `apps/web/src/components/app/SyncedTranscript.tsx` (highlights the turn whose `offsetMs ≤ currentTimeMs < nextOffsetMs`; click a turn seeks the player; tool rows rendered as timeline chips), `apps/web/src/components/app/AnalysisCard.tsx` (summary, sentiment pill, entities, "Summary pending" with a 10 s poll up to 2 min while `analysedAt` is null and the call ended < 5 min ago), `apps/web/src/components/app/OutcomeEditor.tsx` (select + Save → PATCH, shows "Edited by staff" when `outcomeSource === "staff"`), `apps/web/src/app/(app)/app/callbacks/page.tsx`, `apps/web/src/components/app/CallbacksQueue.tsx` (open/done tabs, Mark done, note field, assigned-to), tests: `CallFilters.test.tsx`, `CallPlayer.test.tsx`, `SyncedTranscript.test.tsx`, `OutcomeEditor.test.tsx`, `CallbacksQueue.test.tsx`

**Interfaces:**
- Consumes: Task 5 routes; `serverApi`, `useApi`, `requireActiveClinic`, `Badge`/`OutcomeBadge`/`CallStatusBadge`, `EmptyState`, `Modal`, `formatDateTime`/`formatDuration` (clinic tz), `ToolTimeline` (reuse for tool chips).
- Produces: URL-driven filters on `/app/calls?outcome=&status=&from=&to=` (server component reads `searchParams`, passes to `/v1/calls`), the detail page composed as header → `CallPlayer` → two columns (`SyncedTranscript` | `AnalysisCard` + `OutcomeEditor` + linked callbacks) → footer meta; recording states: `pending` → "Recording is being saved…" (poll every 5 s up to 2 min), `failed` → "Recording unavailable", `none` → no player.

- [ ] **Step 1: Write the failing component tests** (Testing Library, mocked `useApi`): filters update the URL and reset offset; `CallPlayer` requests the URL once and shows an inline error on 409 pending; `SyncedTranscript` highlights the right turn for `currentTimeMs` and seeks on click; `OutcomeEditor` PATCHes and shows the staff badge; `CallbacksQueue` marks done and moves the row to the Done tab.
- [ ] **Step 2: Run → FAIL. Step 3: implement**, keeping all strings honest ("Recording" only when `recordingStatus === "ready"`), masked phones everywhere, keyboard-operable transcript (turns are buttons), `aria-live` on the pending/polling messages, reduced-motion safe.
- [ ] **Step 4: web tests (expect ≈ 170), `npm run build -w @muxaris/web` (with NEXT_PUBLIC_* set), root typecheck, eslint, prettier → PASS.** Check `/app/calls`, `/app/calls/:id` and `/app/callbacks` render against the dev stack with a signed-in session if one is available; otherwise rely on tests and say so in the report.
- [ ] **Step 5: Commit** — two commits: `feat(web): calls list filters, overview KPIs from stats endpoint` and `feat(web): call detail player with synced transcript, analysis, outcome edit, callbacks queue`.

---

### Task 7: Privacy copy, docs, end-to-end verification

**Files:**
- Modify: `apps/web/src/app/privacy/page.tsx` + `apps/web/src/lib/content.ts` (FAQ "Where is our data stored?" and the "Every call logged" card): recordings and transcripts are kept 90 days by default and stored encrypted in AWS Mumbai; the assistant says calls may be recorded; clinics can turn recording off in Settings.
- Modify: `packages/shared/src/api.ts` (`clinicPatchBody` gains `settings: z.object({ recordCalls: z.boolean() }).partial().optional()`), `apps/api/src/routes/me.ts` (owner-only `PATCH /v1/clinics/:id` merges `settings` into the jsonb column), `apps/api/src/routes/me.test.ts`, `apps/web/src/app/(app)/app/settings/page.tsx` (a "Record calls" switch under Assistant, owner-only, with the sentence "When off, calls are transcribed but no audio is kept.")
- Modify: `apps/web/src/lib/copy-guard.test.ts`: allow the word "recorded"; allow "recordings are encrypted" (the bucket uses SSE-S3); keep banning "encrypted at rest" as a blanket claim until the database claim is true in Phase 5.
- Modify: `README.md` (Phase 2 section: StorageStack deploy, env keys, `workers:dev`, e2e flags), `docs/SPIKES.md` or `docs/ARCHITECTURE.md` stub (short "Call pipeline" section with the key layout and lifecycle)
- Modify: `scripts/e2e-voice.ts` (after `ended`: poll `recordingStatus === "ready"`, fetch `/v1/calls/:id/recording-url`, HEAD the URL and assert `content-length > 44` and `content-type: audio/wav`; with `E2E_EXPECT_SUMMARY=1`, poll for `analysedAt`), `scripts/e2e-voice.sh` (optionally start `workers:dev` with `E2E_WITH_WORKER=1`)

- [ ] **Step 1: Write the failing copy-guard and settings tests** (privacy page contains "90 days"; FAQ no longer says "transcribed only"; `PATCH /v1/clinics/:id` with `{ settings: { recordCalls: false } }` by owner → 200, by front_desk → 403; gateway `recordCalls` reads it — covered in Task 3).
- [ ] **Step 2: Implement copy, toggle, docs. Step 3: run the full gate** — root `npm run typecheck && npm run lint && npm run build && npm test && npx prettier --check .`.
- [ ] **Step 4: Run `E2E_WITH_WORKER=1 E2E_EXPECT_SUMMARY=1 bash scripts/e2e-voice.sh`** against real providers and record in the report: WAV bytes, transcript present, summary text length (not content), latency from `ended` to `recordingStatus ready` and to `analysedAt`.
- [ ] **Step 5: Commit** — `git add apps/web/src/app/privacy/page.tsx apps/web/src/lib/content.ts apps/web/src/lib/copy-guard.test.ts apps/web/src/app/(app)/app/settings/page.tsx packages/shared/src/api.ts apps/api/src/routes/me.ts apps/api/src/routes/me.test.ts README.md docs/ARCHITECTURE.md scripts/e2e-voice.ts scripts/e2e-voice.sh && git commit -m "docs(phase-2): recording consent and retention copy, settings toggle, e2e recording checks"`.

## Phase 2 exit criteria
- Root `npm test`, `typecheck`, `build`, `lint`, `prettier --check` pass.
- A real-provider call produces a stereo WAV and transcript JSON in `muxaris-calls-005533348545-ap-south-1` under `clinics/{clinicId}/calls/{callId}/`, the row reaches `recording_status = ready`, and the worker writes a summary, sentiment and entities within 60 s; duplicate deliveries are no-ops.
- Presigned playback works from `/app/calls/:id` with the transcript highlighting in sync; outcome edits are audited; the callbacks queue lists worker- and tool-created callbacks and can mark them done.
- Privacy copy and the spoken disclosure match the shipped behaviour (recorded + transcribed, 90-day retention, per-clinic off switch).
- No PII in gateway, worker or API logs (grep the test logs for the e2e phone number).
