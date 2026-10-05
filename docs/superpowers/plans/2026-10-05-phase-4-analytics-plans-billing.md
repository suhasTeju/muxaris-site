# Phase 4: Analytics, Plans and Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give clinic owners an analytics page, an honest view of their plan and usage, and a Razorpay-backed upgrade to Standard, while closing the usage-ledger gaps that Phase 1 parked.

**Architecture:** Analytics are read-only SQL aggregates in `packages/core` exposed by two new API routes and drawn with dependency-free SVG charts in the web app. Plans become data seeded by a migration (production has none today). Billing is a small core service around a Razorpay HTTP client with an HMAC-verified, idempotent webhook that is the only thing allowed to change `clinics.plan`; everything billing-related is behind `BILLING_ENABLED`.

**Tech Stack:** TypeScript strict, Drizzle + Postgres 16, Hono + zod v4, Next 16 App Router + React 19 (no charting library), Razorpay Subscriptions REST API via `fetch`, Node `crypto` for HMAC, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-04-muxaris-platform-design.md` (Phase 4 section, lines 196–198; dashboard analytics line 144; API line 148; usage ledger line 112; guards line 130).

## Global Constraints

- Strict TS (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), ESLint `no-explicit-any` is an error, Prettier width 100, ESM imports with `.js` suffix, zod v4 (`z.email()`, `z.iso.datetime()`).
- Gate before every commit: `npm run build:packages && npm run typecheck && npm run lint && npx prettier --check .` plus the covering package tests. Postgres-backed tests use `(reachable ? describe : describe.skip)` against the Docker instance on localhost:5433; a run with those tests skipped is not a passing run.
- Never log or print phone numbers, names, email addresses, transcripts, tokens, Razorpay secrets or signatures. Never commit `.env`. Secrets come from `.env` locally and Secrets Manager in AWS.
- AWS: nothing in this phase touches AWS. If a task needs it anyway, only via `scripts/lib/aws-guard.sh` / `infra/scripts/cdk.sh` on account 005533348545.
- Copy: `apps/web/src/lib/copy-guard.test.ts` must pass; no HIPAA, "trusted by", encryption-at-rest or residency claims; prices are "₹0" Pilot and "₹4,999" Standard per month; the Standard plan includes "3,000 call-minutes"; the Pilot includes "500 call-minutes" (not "500 calls") for 30 days.
- Tenant isolation: every analytics, usage and billing query is scoped by `clinic_id`; owner-only routes use `requireClinic(db, "owner")`.
- `clinics.plan` changes only through the billing service (webhook) or the seed; never from a client-supplied field.
- Commit trailer on every commit: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Rulings carried from pre-flight (do not re-litigate)

1. Production has no `plans` rows, so `getPlanForClinic` throws on a fresh database. Task 1 seeds them by migration.
2. "You are never cut off mid-call" (pricing note) is made true: the gateway rejects a new call only when the plan has zero minutes left and no longer clamps an in-flight call to the remaining minutes; overage is recorded in the ledger. Cost: a clinic can overrun by up to one call length per concurrent line.
3. Pilot copy becomes "500 call-minutes" and a visible pilot end date (clinic `createdAt` + 30 days) is shown; expiry is not enforced until a clinic can pay, so no lock-out.
4. The Standard plan's seeded `features` list is trimmed to what marketing claims.
5. Per-process concurrency counters stay as they are (Phase 5, with ECS).

## Review Focus

1. A clinic whose month rolls over mid-call: the ledger row for the month in which the call started gets the usage, not the month at hang-up — Task 2 test "records usage against the month the call started".
2. A webhook delivered twice (Razorpay retries): the second delivery is a no-op and the plan changes once — Task 7 test "a duplicate event id is ignored".
3. A webhook with a valid signature for a subscription that belongs to another clinic, or to no clinic: nothing changes and the handler returns 200 so Razorpay stops retrying — Task 7 test "unknown subscription ids are acknowledged and ignored".
4. An analytics range request that spans a DST-free but offset timezone with `from` after `to`, or longer than 92 days: 400, never a full-table scan — Task 4 test "rejects inverted and oversized ranges".
5. A front-desk user opening Settings sees the plan but cannot start checkout: the button is absent and the API returns 403 — Task 8 tests "owner only" at the route and in the component.

---

## File structure

```
packages/db/src/schema/billing.ts            + subscriptions, billingEvents tables
packages/db/drizzle/0005_plans_billing.sql    generated + hand-appended plan INSERTs
packages/db/src/seed-data.ts                  trimmed standard features (same values as the migration)
packages/core/src/services/usage.ts           recordCallUsage gains tokens; pilotEndsAt helper
packages/core/src/services/calls.ts           sweepStaleCalls records usage for swept calls
packages/core/src/services/analytics.ts       getCallAnalytics, getMonthlyUsage (new)
packages/core/src/billing/razorpay.ts         RazorpayClient interface, HTTP client, signature verify (new)
packages/core/src/billing/subscriptions.ts    startStandardSubscription, applyRazorpayEvent (new)
packages/core/src/billing/index.ts
packages/shared/src/api.ts                    analyticsQuery, usage DTO, billing DTOs/bodies
apps/voice-gateway/src/server.ts              overage ruling; tokens into recordCallUsage
apps/voice-gateway/src/session/voice-session.ts  accumulate LLM usage into metrics
apps/api/src/routes/analytics.ts              GET /v1/analytics/calls, /v1/analytics/usage (new)
apps/api/src/routes/me.ts                     /v1/usage extended; settings edits audited
apps/api/src/routes/billing.ts                GET /v1/billing, POST /v1/billing/subscriptions, POST /webhooks/razorpay (new)
apps/api/src/env.ts, deps.ts, app.ts, index.ts  billing env + deps
apps/web/src/components/charts/BarChart.tsx   accessible SVG bar chart (new)
apps/web/src/components/app/AnalyticsView.tsx + page apps/web/src/app/(app)/app/analytics/page.tsx (new)
apps/web/src/components/app/PlanSettings.tsx  plan, usage, pilot end, upgrade (new)
apps/web/src/components/app/Sidebar.tsx       Analytics nav item
apps/web/src/lib/dashboard.ts                 Usage type extended; analytics types
apps/web/src/lib/content.ts                   pilot copy
README.md, docs/ARCHITECTURE.md, .env.example billing + analytics docs
```

---

### Task 1: Plans seeded by migration, billing tables, notifications index

**Files:**
- Modify: `packages/db/src/schema/billing.ts`, `packages/db/src/seed-data.ts:117-148`, `packages/db/src/schema/index.ts` (if tables are re-exported by name there; check `grep -n billing packages/db/src/schema/index.ts`)
- Create: `packages/db/drizzle/0005_plans_billing.sql` (via `drizzle-kit generate`, then append), `packages/db/src/plans.test.ts`
- Modify: `packages/db/drizzle/meta/_journal.json` + `meta/0005_snapshot.json` (generated)

**Interfaces:**
- Produces: `schema.subscriptions` (id text PK `sub_…`, clinicId FK cascade, provider text default 'razorpay', providerSubscriptionId text unique, providerPlanId text, status text ('created'|'authenticated'|'active'|'halted'|'cancelled'|'completed'|'expired'), currentPeriodEnd timestamptz null, createdAt, updatedAt); `schema.billingEvents` (id text PK = provider event id, provider text, event text, subscriptionId text null, receivedAt timestamptz default now, payload jsonb); `PLAN_SEED` exported from `packages/db/src/seed-data.ts` as the single source of the two plan rows.
- Produces: index `notifications_clinic_patient_idx` on `notifications (clinic_id, patient_id)`.

- [ ] **Step 1: Failing test that a migrated empty database has both plans**

`packages/db/src/plans.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import pg from "pg";
import { eq } from "drizzle-orm";
import { createDb } from "./client.js";
import { schema } from "./index.js";

const url = process.env.DATABASE_URL ?? "postgres://muxaris:muxaris@localhost:5433/muxaris";
async function reachable() {
  const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 2000 });
  try {
    await c.connect();
    return true;
  } catch {
    return false;
  } finally {
    await c.end().catch(() => undefined);
  }
}
const ok = await reachable();
if (!ok) console.warn("WARNING: Postgres unreachable, skipping plans migration test.");

(ok ? describe : describe.skip)("plans are present after migrations, without the demo seed", () => {
  it("has pilot and standard with the marketed limits", async () => {
    const { db, pool } = createDb(url);
    try {
      const [pilot] = await db.select().from(schema.plans).where(eq(schema.plans.id, "pilot"));
      const [std] = await db.select().from(schema.plans).where(eq(schema.plans.id, "standard"));
      expect(pilot).toMatchObject({ includedCallMinutes: 500, priceInrMonthly: 0, maxConcurrentCalls: 2 });
      expect(std).toMatchObject({ includedCallMinutes: 3000, priceInrMonthly: 4999, maxConcurrentCalls: 5 });
      expect(std?.features).toEqual(["ai_receptionist", "dashboard", "email_confirmations", "reminders"]);
      const [sub] = await db.select().from(schema.subscriptions).limit(1);
      expect(sub ?? null).toBeNull(); // table exists and is empty on a fresh database
    } finally {
      await pool.end();
    }
  });
});
```

- [ ] **Step 2: Run it (expect FAIL: `schema.subscriptions` undefined / plans features mismatch)**

Run: `npx vitest run packages/db/src/plans.test.ts`

- [ ] **Step 3: Schema**

Append to `packages/db/src/schema/billing.ts`:

```ts
import { jsonb, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id").primaryKey(), // "sub_…" via newId("sub")
    clinicId: text("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("razorpay"),
    providerSubscriptionId: text("provider_subscription_id").notNull(),
    providerPlanId: text("provider_plan_id").notNull(),
    // created | authenticated | active | halted | cancelled | completed | expired (Razorpay states)
    status: text("status").notNull().default("created"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("subscriptions_provider_sub_uq").on(t.provider, t.providerSubscriptionId),
    index("subscriptions_clinic_idx").on(t.clinicId),
  ],
);

/** One row per provider event id: the webhook's idempotency ledger. */
export const billingEvents = pgTable("billing_events", {
  id: text("id").primaryKey(), // provider event id (Razorpay `x-razorpay-event-id`)
  provider: text("provider").notNull().default("razorpay"),
  event: text("event").notNull(),
  subscriptionId: text("subscription_id"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
});
```

(Merge the import line with the existing one: `import { pgTable, text, integer, primaryKey, jsonb, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";`.)

Add the notifications index in `packages/db/src/schema/messaging.ts`: find the `notifications` table's index array and add `index("notifications_clinic_patient_idx").on(t.clinicId, t.patientId)`.

In `packages/db/src/seed-data.ts` replace the inline plan values with an exported constant placed above `seedDemoClinic` and used by it:

```ts
/** The two plans. The migration 0005 inserts the same rows; keep both in step. */
export const PLAN_SEED = [
  {
    id: "pilot",
    name: "Pilot",
    priceInrMonthly: 0,
    includedCallMinutes: 500,
    maxConcurrentCalls: 2,
    features: ["ai_receptionist", "dashboard", "email_confirmations", "reminders"],
  },
  {
    id: "standard",
    name: "Standard",
    priceInrMonthly: 4999,
    includedCallMinutes: 3000,
    maxConcurrentCalls: 5,
    features: ["ai_receptionist", "dashboard", "email_confirmations", "reminders"],
  },
] as const;
```

and `.values([...PLAN_SEED])` in `seedDemoClinic` (keep its `onConflictDoUpdate`, and add `features: sql\`excluded.features\`` to the `set` if it is not already there).

- [ ] **Step 4: Generate the migration, then append the data**

Run: `npm run generate -w @muxaris/db -- --name plans_billing`. Confirm `packages/db/drizzle/0005_plans_billing.sql` contains `CREATE TABLE "subscriptions"`, `CREATE TABLE "billing_events"`, the two subscription indexes and `notifications_clinic_patient_idx`, and that `meta/_journal.json` gained idx 5. Then append (statement breakpoints exactly as Drizzle writes them):

```sql
--> statement-breakpoint
INSERT INTO "plans" ("id","name","price_inr_monthly","included_call_minutes","max_concurrent_calls","features")
VALUES ('pilot','Pilot',0,500,2,ARRAY['ai_receptionist','dashboard','email_confirmations','reminders'])
ON CONFLICT ("id") DO UPDATE SET "name"=excluded."name","price_inr_monthly"=excluded."price_inr_monthly","included_call_minutes"=excluded."included_call_minutes","max_concurrent_calls"=excluded."max_concurrent_calls","features"=excluded."features";--> statement-breakpoint
INSERT INTO "plans" ("id","name","price_inr_monthly","included_call_minutes","max_concurrent_calls","features")
VALUES ('standard','Standard',4999,3000,5,ARRAY['ai_receptionist','dashboard','email_confirmations','reminders'])
ON CONFLICT ("id") DO UPDATE SET "name"=excluded."name","price_inr_monthly"=excluded."price_inr_monthly","included_call_minutes"=excluded."included_call_minutes","max_concurrent_calls"=excluded."max_concurrent_calls","features"=excluded."features";
```

- [ ] **Step 5: Migrate the local database and run the test (expect PASS)**

Run: `npm run db:migrate && npx vitest run packages/db/src/plans.test.ts`

- [ ] **Step 6: Gate and commit**

```bash
git add packages/db
git commit -m "feat(db): seed plans by migration, subscriptions and billing_events tables, notifications patient index"
```

---

### Task 2: Usage ledger gaps and the in-flight overage ruling

**Files:**
- Modify: `packages/core/src/services/usage.ts`, `packages/core/src/services/calls.ts:497-540` (`sweepStaleCalls`), `apps/voice-gateway/src/session/voice-session.ts` (LLM `done` handling ~line 910, `metrics()` ~line 557), `apps/voice-gateway/src/server.ts:449-470` and the settle block ~line 585-600
- Test: `packages/core/src/services/usage.test.ts` (create), `packages/core/src/services/calls-centre.test.ts` (sweep case), `apps/voice-gateway/src/server.test.ts` (existing quota/busy cases), `apps/voice-gateway/src/session/voice-session.test.ts`

**Interfaces:**
- Consumes: `recordCallUsage(db, {clinicId, month, callSeconds})`, `usageMonth(tz, at)`, `getPlanForClinic`, `getUsedCallSeconds`, Bedrock stream `done` events carrying `usage?: { inputTokens: number; outputTokens: number }` (`apps/voice-gateway/src/providers/types.ts:38`).
- Produces: `recordCallUsage(db, { clinicId, month, callSeconds, llmInputTokens?, llmOutputTokens? })`; `pilotEndsAt(createdAt: Date): Date` (createdAt + 30 days); `sweepStaleCalls` result gains `usageRecorded: number`; call `metrics` gain `llmInputTokens`, `llmOutputTokens`.

- [ ] **Step 1: Failing core tests**

`packages/core/src/services/usage.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { schema } from "@muxaris/db";
import { pilotEndsAt, recordCallUsage, usageMonth } from "./usage.js";
import { dbReachable, makeTestClinic, openDb, warnIfUnreachable } from "./test-support.js";

const reachable = await dbReachable();
warnIfUnreachable(reachable, "usage");
const { db, pool } = openDb();

describe("pilotEndsAt", () => {
  it("is 30 days after the clinic was created", () => {
    expect(pilotEndsAt(new Date("2026-10-05T10:00:00Z")).toISOString()).toBe("2026-11-04T10:00:00.000Z");
  });
});

(reachable ? describe : describe.skip)("recordCallUsage", () => {
  let c: Awaited<ReturnType<typeof makeTestClinic>>;
  beforeAll(async () => {
    c = await makeTestClinic(db, "usage");
  });
  afterAll(async () => {
    await c.cleanup();
    await pool.end();
  });

  it("adds seconds, calls and tokens to the month row", async () => {
    const month = "2026-02";
    await recordCallUsage(db, { clinicId: c.clinic.id, month, callSeconds: 61, llmInputTokens: 100, llmOutputTokens: 40 });
    await recordCallUsage(db, { clinicId: c.clinic.id, month, callSeconds: 30 });
    const [row] = await db
      .select()
      .from(schema.usageLedger)
      .where(and(eq(schema.usageLedger.clinicId, c.clinic.id), eq(schema.usageLedger.month, month)));
    expect(row).toMatchObject({ callSeconds: 91, calls: 2, llmInputTokens: 100, llmOutputTokens: 40 });
  });

  it("records usage against the month the call started", () => {
    // 2026-10-31 23:50 IST started, ended after midnight: the key is October.
    expect(usageMonth("Asia/Kolkata", new Date("2026-10-31T18:20:00Z"))).toBe("2026-10");
    expect(usageMonth("Asia/Kolkata", new Date("2026-10-31T18:40:00Z"))).toBe("2026-11");
  });
});
```

Add to `calls-centre.test.ts` (inside its existing reachable describe, using its clinic): insert a `calls` row with `status: "in_progress"`, `startedAt` 40 minutes ago, `clinicId` of the test clinic; call `sweepStaleCalls(db, { inProgressOlderThanMin: 30 })`; assert the returned `usageRecorded >= 1` and the clinic's `usage_ledger` row for `usageMonth(clinic.timezone, startedAt)` has `calls >= 1` and `callSeconds >= 1`.

- [ ] **Step 2: Run (expect FAIL: `pilotEndsAt` not exported; `llmInputTokens` not in the input type; `usageRecorded` undefined)**

Run: `npx vitest run packages/core/src/services/usage.test.ts packages/core/src/services/calls-centre.test.ts`

- [ ] **Step 3: Core implementation**

`usage.ts`:

```ts
export const PILOT_DAYS = 30;
/** When a pilot clinic's 30 days end. Shown, not enforced, until the clinic can pay. */
export function pilotEndsAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + PILOT_DAYS * 86_400_000);
}

export async function recordCallUsage(
  db: Db,
  input: {
    clinicId: string;
    month: string;
    callSeconds: number;
    llmInputTokens?: number;
    llmOutputTokens?: number;
  },
) {
  const seconds = Math.max(0, Math.round(input.callSeconds));
  const inTok = Math.max(0, Math.round(input.llmInputTokens ?? 0));
  const outTok = Math.max(0, Math.round(input.llmOutputTokens ?? 0));
  await db
    .insert(usageLedger)
    .values({
      clinicId: input.clinicId,
      month: input.month,
      callSeconds: seconds,
      calls: 1,
      llmInputTokens: inTok,
      llmOutputTokens: outTok,
    })
    .onConflictDoUpdate({
      target: [usageLedger.clinicId, usageLedger.month],
      set: {
        callSeconds: sql`${usageLedger.callSeconds} + excluded.call_seconds`,
        calls: sql`${usageLedger.calls} + excluded.calls`,
        llmInputTokens: sql`${usageLedger.llmInputTokens} + excluded.llm_input_tokens`,
        llmOutputTokens: sql`${usageLedger.llmOutputTokens} + excluded.llm_output_tokens`,
      },
    });
}
```

`calls.ts` `sweepStaleCalls`: change the `abandoned` `.returning({ id: calls.id })` to `.returning({ id: calls.id, clinicId: calls.clinicId, startedAt: calls.startedAt, durationS: calls.durationS })`, then after it:

```ts
  // Swept calls never reached the gateway's settle path, so record their usage here.
  let usageRecorded = 0;
  for (const row of abandoned) {
    const [clinic] = await db
      .select({ timezone: schema.clinics.timezone })
      .from(schema.clinics)
      .where(eq(schema.clinics.id, row.clinicId));
    if (!clinic) continue;
    await recordCallUsage(db, {
      clinicId: row.clinicId,
      month: usageMonth(clinic.timezone, row.startedAt),
      callSeconds: row.durationS ?? 0,
    });
    usageRecorded++;
  }
```

and return `{ abandoned: abandoned.length, recordingsFailed: failed.length, usageRecorded }`. Import `recordCallUsage, usageMonth` from `./usage.js` (check for an import cycle: `usage.ts` imports nothing from `calls.ts`, so this is safe).

- [ ] **Step 4: Run core tests (expect PASS), then the gateway**

Run: `npx vitest run packages/core/src/services/usage.test.ts packages/core/src/services/calls-centre.test.ts`

- [ ] **Step 5: Failing gateway tests**

In `apps/voice-gateway/src/session/voice-session.test.ts` add a case using the existing fake LLM that yields `{ type: "done", stopReason: "end_turn", usage: { inputTokens: 120, outputTokens: 30 } }` for one turn and `{ inputTokens: 80, outputTokens: 20 }` for a second: after the session ends, the `finishCall` metrics (read the `calls` row or the fake db hook the file already uses) contain `llmInputTokens: 200` and `llmOutputTokens: 50`.

In `apps/voice-gateway/src/server.test.ts` locate the quota tests (lines ~119–653 contain "quota" and "busy"). Change/add:
- "a plan with 90 seconds left still allows a call capped only by MAX_CALL_SECONDS": `ready.secondsRemaining` equals `env.maxCallSeconds` and `ready.planSecondsRemaining` equals 90.
- "a plan with 0 seconds left rejects with 4029 quota" stays as is.
- "settle records tokens": after a call with the fake LLM reporting usage, `usage_ledger.llmInputTokens` for the clinic/month is > 0 (the server tests already hit Postgres for `recordCallUsage`; follow their pattern).

- [ ] **Step 6: Gateway implementation**

`voice-session.ts`: add fields `private llmInputTokens = 0; private llmOutputTokens = 0;`; in the stream loop's `done` branch:

```ts
            } else if (d.type === "done") {
              stopReason = d.stopReason;
              if (d.usage) {
                this.llmInputTokens += d.usage.inputTokens;
                this.llmOutputTokens += d.usage.outputTokens;
              }
            }
```

and in `metrics()` add `llmInputTokens: this.llmInputTokens, llmOutputTokens: this.llmOutputTokens`. Expose them: `get llmUsage(): { inputTokens: number; outputTokens: number } { return { inputTokens: this.llmInputTokens, outputTokens: this.llmOutputTokens }; }`.

`server.ts`: replace the cap block with

```ts
    const plan = await ctl.bound(getPlanForClinic(db, clinicId));
    const month = usageMonth(clinic.clinic.timezone, now());
    const used = await ctl.bound(getUsedCallSeconds(db, clinicId, month));
    if (ctl.gone()) return;
    const planSecondsRemaining = plan.includedCallMinutes * 60 - used;
    if (planSecondsRemaining <= 0) {
      log.info("quota exhausted", { sub: identity.sub, clinicId });
      rejectWith(ws, 4029, "quota", "monthly call minutes exhausted");
      return;
    }
    // Pricing promise: a call that starts is never cut off by the plan; overage lands in the
    // ledger and is billed per minute. Only the per-call cap limits an in-flight call.
    const callSecondsAllowed = env.maxCallSeconds;
```

Keep the `ready` event's conditional `planSecondsRemaining` (now purely informational: it tells the client the plan is nearly used up). In the settle block pass tokens: `recordCallUsage(db, { clinicId, month: usageMonth(clinic.clinic.timezone, startedAt), callSeconds: durationS, llmInputTokens: session.llmUsage.inputTokens, llmOutputTokens: session.llmUsage.outputTokens })` where `startedAt` is the call's start instant that the server already holds (the value used for the `calls` row; if only `now()` at accept time is available, capture `const startedAt = now();` right before creating the row and reuse it). This also pins Review Focus 1.

- [ ] **Step 7: Run gateway tests (expect PASS)**

Run: `npx vitest run apps/voice-gateway`

- [ ] **Step 8: Gate and commit**

```bash
git add packages/core apps/voice-gateway
git commit -m "feat(usage): ledger counts swept calls and LLM tokens; in-flight calls are never cut off by the plan"
```

---

### Task 3: Analytics queries (core)

**Files:**
- Create: `packages/core/src/services/analytics.ts`, `packages/core/src/services/analytics.test.ts`
- Modify: `packages/core/src/index.ts` (export)

**Interfaces:**
- Produces:

```ts
export interface CallAnalytics {
  from: string; // YYYY-MM-DD (clinic-local, inclusive)
  to: string;   // YYYY-MM-DD (clinic-local, inclusive)
  totalCalls: number;
  bookedCalls: number;
  bookingConversion: number; // 0..1, 0 when totalCalls is 0
  avgDurationS: number | null;
  byOutcome: Record<string, number>;
  byLanguage: Record<string, number>; // language code -> calls, "unknown" when null
  byHour: number[]; // 24 entries, clinic-local hour of call start
  byDay: Array<{ date: string; calls: number; booked: number }>; // one entry per day in range
}
export function getCallAnalytics(db: Db, clinicId: string, range: { from: string; to: string; timezone: string }): Promise<CallAnalytics>;
export interface MonthlyUsage { month: string; callSeconds: number; calls: number; llmInputTokens: number; llmOutputTokens: number }
export function getMonthlyUsage(db: Db, clinicId: string, months: number): Promise<MonthlyUsage[]>; // oldest first, zero-filled
export function localDayWindow(from: string, to: string, timezone: string): { start: Date; end: Date }; // [start of from, start of day after to)
```

- [ ] **Step 1: Failing test**

`analytics.test.ts` (reachable-gated; uses `makeTestClinic`, inserts `calls` rows directly with `newId("call")`, `channel: "browser"`, `status: "completed"`, chosen `startedAt`, `outcome`, `languageDetected`, `durationS`; clinic timezone is Asia/Kolkata by default):

```ts
it("aggregates calls by outcome, language, local hour and day, with booking conversion", async () => {
  // Two calls on 2026-09-10 IST (04:30Z = 10:00 IST, 13:30Z = 19:00 IST), one on 2026-09-11.
  await db.insert(schema.calls).values([
    row("2026-09-10T04:30:00Z", "booked", "kn-IN", 120),
    row("2026-09-10T13:30:00Z", "info", "en-IN", 60),
    row("2026-09-11T05:00:00Z", "booked", null, 90),
  ]);
  const a = await getCallAnalytics(db, c.clinic.id, { from: "2026-09-10", to: "2026-09-11", timezone: "Asia/Kolkata" });
  expect(a.totalCalls).toBe(3);
  expect(a.bookedCalls).toBe(2);
  expect(a.bookingConversion).toBeCloseTo(2 / 3);
  expect(a.byOutcome).toEqual({ booked: 2, info: 1 });
  expect(a.byLanguage).toEqual({ "kn-IN": 1, "en-IN": 1, unknown: 1 });
  expect(a.byHour[10]).toBe(2); // 10:00 IST and 10:30 IST
  expect(a.byHour[19]).toBe(1);
  expect(a.byDay).toEqual([
    { date: "2026-09-10", calls: 2, booked: 1 },
    { date: "2026-09-11", calls: 1, booked: 1 },
  ]);
  expect(a.avgDurationS).toBe(90);
});

it("is scoped to the clinic and zero-fills empty days", async () => {
  const other = await makeTestClinic(db, "analytics-other");
  try {
    const a = await getCallAnalytics(db, other.clinic.id, { from: "2026-09-10", to: "2026-09-12", timezone: "Asia/Kolkata" });
    expect(a.totalCalls).toBe(0);
    expect(a.bookingConversion).toBe(0);
    expect(a.byDay.map((d) => d.calls)).toEqual([0, 0, 0]);
    expect(a.byHour).toHaveLength(24);
  } finally {
    await other.cleanup();
  }
});

it("zero-fills monthly usage, oldest first", async () => {
  await recordCallUsage(db, { clinicId: c.clinic.id, month: "2026-07", callSeconds: 600 });
  const m = await getMonthlyUsage(db, c.clinic.id, 3, new Date("2026-09-15T00:00:00Z"), "Asia/Kolkata");
  expect(m.map((x) => x.month)).toEqual(["2026-07", "2026-08", "2026-09"]);
  expect(m[0]).toMatchObject({ callSeconds: 600, calls: 1 });
  expect(m[1]).toMatchObject({ callSeconds: 0, calls: 0 });
});
```

(`getMonthlyUsage(db, clinicId, months, at = new Date(), timezone = "Asia/Kolkata")`: the optional `at`/`timezone` exist for tests and the API passes the clinic timezone.)

- [ ] **Step 2: Run (expect FAIL: module not found)**

Run: `npx vitest run packages/core/src/services/analytics.test.ts`

- [ ] **Step 3: Implement**

```ts
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { schema, type Db } from "@muxaris/db";
import { assertDateString } from "../scheduling/time.js";
import { usageMonth } from "./usage.js";
import { CoreError } from "./errors.js";

const { calls, usageLedger } = schema;

function zoneOffset(date: string, timeZone: string): string {
  const probe = new Date(`${date}T12:00:00Z`);
  const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(probe)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = part?.match(/^GMT(?:([+-]\d{2}):?(\d{2})?)?$/);
  if (!m) return "Z";
  return m[1] ? `${m[1]}:${m[2] ?? "00"}` : "Z";
}
function startOfLocalDay(date: string, timeZone: string): Date {
  return new Date(`${date}T00:00:00${zoneOffset(date, timeZone)}`);
}
function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const MAX_RANGE_DAYS = 92;

export function localDayWindow(from: string, to: string, timeZone: string) {
  assertDateString(from);
  assertDateString(to);
  if (to < from) throw new CoreError("validation", "`to` must not be before `from`");
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
  if (days > MAX_RANGE_DAYS) throw new CoreError("validation", `range exceeds ${MAX_RANGE_DAYS} days`);
  return { start: startOfLocalDay(from, timeZone), end: startOfLocalDay(addDays(to, 1), timeZone), days };
}

export async function getCallAnalytics(db: Db, clinicId: string, range: { from: string; to: string; timezone: string }): Promise<CallAnalytics> {
  const { start, end, days } = localDayWindow(range.from, range.to, range.timezone);
  const inWindow = and(eq(calls.clinicId, clinicId), gte(calls.startedAt, start), lt(calls.startedAt, end));
  const tz = range.timezone;
  const [agg] = await db
    .select({
      n: sql<number>`count(*)::int`,
      booked: sql<number>`count(*) FILTER (WHERE ${calls.outcome} = 'booked')::int`,
      avg: sql<string | null>`avg(${calls.durationS}) FILTER (WHERE ${calls.endedAt} IS NOT NULL)`,
    })
    .from(calls)
    .where(inWindow);
  const outcomes = await db
    .select({ k: calls.outcome, n: sql<number>`count(*)::int` })
    .from(calls)
    .where(and(inWindow, sql`${calls.outcome} IS NOT NULL`))
    .groupBy(calls.outcome);
  const languages = await db
    .select({ k: sql<string>`coalesce(${calls.languageDetected}, 'unknown')`, n: sql<number>`count(*)::int` })
    .from(calls)
    .where(inWindow)
    .groupBy(sql`coalesce(${calls.languageDetected}, 'unknown')`);
  const hours = await db
    .select({ h: sql<number>`extract(hour from (${calls.startedAt} AT TIME ZONE ${tz}))::int`, n: sql<number>`count(*)::int` })
    .from(calls)
    .where(inWindow)
    .groupBy(sql`extract(hour from (${calls.startedAt} AT TIME ZONE ${tz}))`);
  const perDay = await db
    .select({
      d: sql<string>`to_char(${calls.startedAt} AT TIME ZONE ${tz}, 'YYYY-MM-DD')`,
      n: sql<number>`count(*)::int`,
      booked: sql<number>`count(*) FILTER (WHERE ${calls.outcome} = 'booked')::int`,
    })
    .from(calls)
    .where(inWindow)
    .groupBy(sql`to_char(${calls.startedAt} AT TIME ZONE ${tz}, 'YYYY-MM-DD')`);

  const byOutcome: Record<string, number> = {};
  for (const o of outcomes) if (o.k) byOutcome[o.k] = o.n;
  const byLanguage: Record<string, number> = {};
  for (const l of languages) byLanguage[l.k] = l.n;
  const byHour = new Array<number>(24).fill(0);
  for (const h of hours) if (h.h >= 0 && h.h < 24) byHour[h.h] = h.n;
  const dayMap = new Map(perDay.map((d) => [d.d, d]));
  const byDay: CallAnalytics["byDay"] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(range.from, i);
    const d = dayMap.get(date);
    byDay.push({ date, calls: d?.n ?? 0, booked: d?.booked ?? 0 });
  }
  const totalCalls = agg?.n ?? 0;
  const bookedCalls = agg?.booked ?? 0;
  return {
    from: range.from,
    to: range.to,
    totalCalls,
    bookedCalls,
    bookingConversion: totalCalls ? bookedCalls / totalCalls : 0,
    avgDurationS: agg?.avg == null ? null : Math.round(Number(agg.avg)),
    byOutcome,
    byLanguage,
    byHour,
    byDay,
  };
}

export async function getMonthlyUsage(db: Db, clinicId: string, months: number, at: Date = new Date(), timezone = "Asia/Kolkata"): Promise<MonthlyUsage[]> {
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(at);
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - i);
    keys.push(usageMonth(timezone, d));
  }
  const rows = await db
    .select()
    .from(usageLedger)
    .where(and(eq(usageLedger.clinicId, clinicId), sql`${usageLedger.month} >= ${keys[0]!}`));
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  return keys.map((month) => {
    const r = byMonth.get(month);
    return {
      month,
      callSeconds: r?.callSeconds ?? 0,
      calls: r?.calls ?? 0,
      llmInputTokens: r?.llmInputTokens ?? 0,
      llmOutputTokens: r?.llmOutputTokens ?? 0,
    };
  });
}
```

Note: the `AT TIME ZONE ${tz}` parameter is bound as text, which Postgres accepts for `timestamptz AT TIME ZONE text`. The `usageMonth` call at the 1st of the month in UTC is safe for every zone (the 1st 00:00Z is the 1st locally for zones east of UTC, and the 31st/30th late evening for western zones; India is +05:30 and the clinic default; for safety compute `d.setUTCDate(1); d.setUTCHours(12)` so noon UTC is the 1st everywhere).

Export from `packages/core/src/index.ts`: `export * from "./services/analytics.js";`.

- [ ] **Step 4: Run (expect PASS), gate, commit**

```bash
git add packages/core
git commit -m "feat(core): call analytics and monthly usage aggregates"
```

---

### Task 4: Analytics and usage API routes

**Files:**
- Create: `apps/api/src/routes/analytics.ts`, `apps/api/src/routes/analytics.test.ts`
- Modify: `packages/shared/src/api.ts` (schemas + DTOs), `apps/api/src/routes/me.ts:95-115` (`/v1/usage`), `apps/api/src/app.ts` (mount), `apps/web/src/lib/dashboard.ts:120-126` (`Usage` type)

**Interfaces:**
- Produces (shared): `analyticsCallsQuery = z.object({ from: dateString, to: dateString })` where `dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`; `analyticsUsageQuery = z.object({ months: z.coerce.number().int().min(1).max(12).default(6) })`; DTO `CallAnalytics` and `MonthlyUsage` (same shapes as Task 3), `UsageSummary`:

```ts
export interface UsageSummary {
  month: string;
  callSeconds: number;
  calls: number;
  llmInputTokens: number;
  llmOutputTokens: number;
  includedCallMinutes: number;
  overageSeconds: number; // max(0, callSeconds - includedCallMinutes*60)
  plan: "pilot" | "standard";
  planName: string;
  priceInrMonthly: number;
  maxConcurrentCalls: number;
  pilotEndsAt: Iso | null; // pilot only
}
```
- Routes: `GET /v1/analytics/calls?from&to` → `CallAnalytics`; `GET /v1/analytics/usage?months` → `{ months: MonthlyUsage[] }`; `GET /v1/usage` → `UsageSummary` (superset of today's fields, so the web `Usage` type extends without breaking).

- [ ] **Step 1: Failing route tests** (copy the clinic/user bootstrap from `apps/api/src/usage.test.ts`; insert two `calls` rows directly for the clinic on a fixed date)

```ts
it("returns analytics for a range and rejects inverted and oversized ranges", async () => {
  const ok = await req(`/analytics/calls?from=2026-09-01&to=2026-09-30`, clinicId);
  expect(ok.status).toBe(200);
  const body = (await ok.json()) as J;
  expect(body.byDay).toHaveLength(30);
  expect(body.byHour).toHaveLength(24);
  expect(body.totalCalls).toBe(2);
  expect((await req(`/analytics/calls?from=2026-09-30&to=2026-09-01`, clinicId)).status).toBe(400);
  expect((await req(`/analytics/calls?from=2026-01-01&to=2026-06-30`, clinicId)).status).toBe(400);
  expect((await req(`/analytics/calls?from=2026-09-01`, clinicId)).status).toBe(400);
});
it("returns zero-filled monthly usage and the usage summary with plan facts", async () => {
  const m = await req(`/analytics/usage?months=3`, clinicId);
  expect(m.status).toBe(200);
  expect(((await m.json()) as J).months).toHaveLength(3);
  const u = await req(`/usage`, clinicId);
  const body = (await u.json()) as J;
  expect(body).toMatchObject({ plan: "pilot", planName: "Pilot", includedCallMinutes: 500, priceInrMonthly: 0, maxConcurrentCalls: 2, overageSeconds: 0 });
  expect(typeof body.pilotEndsAt).toBe("string");
});
it("is scoped to the clinic header", async () => {
  // a second clinic created by the same user sees no calls
  ...expect(totalCalls).toBe(0)
});
```

- [ ] **Step 2: Run (expect FAIL 404)**

Run: `npx vitest run apps/api/src/routes/analytics.test.ts`

- [ ] **Step 3: Implement**

`apps/api/src/routes/analytics.ts`:

```ts
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getCallAnalytics, getMonthlyUsage, CoreError } from "@muxaris/core";
import { schema, type Db } from "@muxaris/db";
import { analyticsCallsQuery, analyticsUsageQuery } from "@muxaris/shared";
import type { AppEnv } from "../deps.js";
import { requireClinic } from "../auth/middleware.js";
import { v } from "../validate.js";

async function clinicTz(db: Db, clinicId: string): Promise<string> {
  const [c] = await db.select({ timezone: schema.clinics.timezone }).from(schema.clinics).where(eq(schema.clinics.id, clinicId));
  if (!c) throw new CoreError("not_found", "clinic not found");
  return c.timezone;
}

export function analyticsRoutes(db: Db) {
  const r = new Hono<AppEnv>();
  const member = requireClinic(db);
  r.get("/analytics/calls", member, v("query", analyticsCallsQuery), async (c) => {
    const clinicId = c.get("clinic").id;
    const { from, to } = c.req.valid("query");
    const timezone = await clinicTz(db, clinicId);
    return c.json(await getCallAnalytics(db, clinicId, { from, to, timezone }));
  });
  r.get("/analytics/usage", member, v("query", analyticsUsageQuery), async (c) => {
    const clinicId = c.get("clinic").id;
    const timezone = await clinicTz(db, clinicId);
    return c.json({ months: await getMonthlyUsage(db, clinicId, c.req.valid("query").months, new Date(), timezone) });
  });
  return r;
}
```

`CoreError("validation", …)` already maps to 400 through `CORE_STATUS` in `app.ts`; no change needed there.

`me.ts` `/usage`: replace the handler body to use `getPlanForClinic` and return the `UsageSummary` above (`pilotEndsAt: clinic.plan === "pilot" ? pilotEndsAt(clinic.createdAt).toISOString() : null`, `overageSeconds: Math.max(0, callSeconds - plan.includedCallMinutes * 60)`). Mount `v1.route("/", analyticsRoutes(deps.db));` in `app.ts`. Update `apps/web/src/lib/dashboard.ts` `Usage` to the `UsageSummary` shape (import the type from `@muxaris/shared` and `export type Usage = UsageSummary;`).

- [ ] **Step 4: Run (expect PASS), gate (`npx vitest run apps/api apps/web`), commit**

```bash
git add packages/shared apps/api apps/web/src/lib/dashboard.ts
git commit -m "feat(api): analytics routes and a fuller usage summary"
```

---

### Task 5: Analytics page with SVG charts

**Files:**
- Create: `apps/web/src/components/charts/BarChart.tsx`, `apps/web/src/components/charts/BarChart.test.tsx`, `apps/web/src/components/app/AnalyticsView.tsx`, `apps/web/src/components/app/AnalyticsView.test.tsx`, `apps/web/src/app/(app)/app/analytics/page.tsx`
- Modify: `apps/web/src/components/app/Sidebar.tsx:8-37` (NAV), `apps/web/src/lib/dashboard.ts` (`LANGUAGE_LABEL` reuse via `languageLabel`, `OUTCOME_LABEL`), `apps/web/src/components/app/OverviewView.tsx` (usage card hint: pilot end date and overage)

**Interfaces:**
- Consumes: `GET /v1/analytics/calls`, `GET /v1/analytics/usage`, `GET /v1/usage` (Task 4 DTOs), `dayRange`/`localDateKey`/`addDays` from `lib/dashboard.ts`, `languageLabel`, `OUTCOME_LABEL`, `formatDuration`.
- Produces: `BarChart({ title, series, categories, orientation?, valueLabel? })` where `series: Array<{ name: string; values: number[]; className?: string }>` and `categories: string[]`; renders an `<figure>` with `<svg role="img" aria-label=…>` and a visually hidden `<table>` carrying the same numbers (screen readers and tests read the table).

- [ ] **Step 1: Failing chart test**

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { BarChart } from "./BarChart";
afterEach(cleanup);
describe("BarChart", () => {
  it("renders one bar per value and a data table with the same numbers", () => {
    render(<BarChart title="Calls by day" categories={["Mon", "Tue"]} series={[{ name: "Calls", values: [3, 0] }]} />);
    expect(screen.getByRole("img", { name: /calls by day/i })).toBeTruthy();
    expect(document.querySelectorAll("rect[data-bar]")).toHaveLength(2);
    const table = screen.getByRole("table", { name: /calls by day/i });
    expect(table.textContent).toContain("Mon");
    expect(table.textContent).toContain("3");
  });
  it("scales bars to the largest value and never divides by zero", () => {
    render(<BarChart title="Empty" categories={["a"]} series={[{ name: "x", values: [0] }]} />);
    const bar = document.querySelector("rect[data-bar]") as SVGRectElement;
    expect(Number(bar.getAttribute("height"))).toBe(0);
  });
});
```

- [ ] **Step 2: Run (expect FAIL), implement `BarChart`**

```tsx
export interface BarSeries { name: string; values: number[]; className?: string }
const W = 640, H = 220, PAD_L = 36, PAD_B = 28, PAD_T = 8, GAP = 0.2;
export function BarChart({ title, categories, series, valueLabel = (v) => String(v) }: {
  title: string; categories: string[]; series: BarSeries[]; valueLabel?: (v: number) => string;
}) {
  const max = Math.max(0, ...series.flatMap((s) => s.values));
  const groupW = (W - PAD_L) / Math.max(1, categories.length);
  const barW = (groupW * (1 - GAP)) / Math.max(1, series.length);
  const plotH = H - PAD_B - PAD_T;
  const y = (v: number) => (max === 0 ? 0 : (v / max) * plotH);
  const tickEvery = categories.length > 14 ? Math.ceil(categories.length / 7) : 1;
  return (
    <figure className="border-line bg-surface rounded-card border p-4">
      <figcaption className="text-muted text-sm">{title}</figcaption>
      <svg role="img" aria-label={title} viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full">
        <line x1={PAD_L} x2={W} y1={H - PAD_B} y2={H - PAD_B} stroke="var(--color-line)" />
        <text x={0} y={PAD_T + 10} fontSize="11" fill="var(--color-muted)">{valueLabel(max)}</text>
        {categories.map((cat, i) => (
          <g key={cat + i} transform={`translate(${PAD_L + i * groupW + (groupW * GAP) / 2},0)`}>
            {series.map((s, j) => {
              const v = s.values[i] ?? 0;
              const h = y(v);
              return (
                <rect key={s.name} data-bar x={j * barW} y={H - PAD_B - h} width={Math.max(1, barW - 1)} height={h}
                  className={s.className ?? (j === 0 ? "fill-[var(--color-accent)]" : "fill-[var(--color-ink)]/40")}>
                  <title>{`${cat} · ${s.name}: ${valueLabel(v)}`}</title>
                </rect>
              );
            })}
            {i % tickEvery === 0 && (
              <text x={(groupW * (1 - GAP)) / 2} y={H - 8} fontSize="11" textAnchor="middle" fill="var(--color-muted)">{cat}</text>
            )}
          </g>
        ))}
      </svg>
      {series.length > 1 && (
        <ul className="text-muted mt-1 flex gap-4 text-xs" aria-hidden="true">
          {series.map((s, j) => (<li key={s.name}><span className={`mr-1 inline-block h-2 w-2 ${j === 0 ? "bg-[var(--color-accent)]" : "bg-[var(--color-ink)]/40"}`} />{s.name}</li>))}
        </ul>
      )}
      <table className="sr-only" aria-label={title}>
        <thead><tr><th>Category</th>{series.map((s) => <th key={s.name}>{s.name}</th>)}</tr></thead>
        <tbody>{categories.map((cat, i) => (<tr key={cat + i}><th scope="row">{cat}</th>{series.map((s) => <td key={s.name}>{valueLabel(s.values[i] ?? 0)}</td>)}</tr>))}</tbody>
      </table>
    </figure>
  );
}
```

(Tailwind v4: `sr-only` exists; `fill-[...]` arbitrary values are fine. Put the component in `components/charts/` so later charts share it.)

- [ ] **Step 3: Failing view test** (`AnalyticsView.test.tsx`, jsdom): render `AnalyticsView` with a fixture `CallAnalytics` (7 days, two outcomes, two languages, `byHour` with a peak at 11) and a `months` fixture; assert the four chart titles ("Calls per day", "Calls by hour", "Calls by language", "Minutes per month") are present as `img` roles, the KPI strip shows "Booking rate 50%" and "Average call" with a duration, language labels come from `languageLabel` (e.g. "Kannada" not "kn-IN"), and the range links for 7, 30 and 90 days have `href="/app/analytics?days=7"` etc. with the active one `aria-current="page"`.

- [ ] **Step 4: Implement the view and page**

`AnalyticsView` props: `{ analytics: Section<CallAnalytics>; months: Section<MonthlyUsage[]>; days: 7 | 30 | 90; tz: string }`. Layout: heading "Analytics", range links, KPI strip (Calls, Booked, Booking rate = `Math.round(bookingConversion*100)%`, Average call = `formatDuration(avgDurationS)`), then charts: Calls per day (two series Calls/Booked, categories `byDay.map(d => d.date.slice(5))` (MM-DD)), Calls by hour (categories `"0"…"23"`, series `byHour`), Calls by language (categories `Object.keys(byLanguage).map(languageLabel)`), Calls by outcome (categories from `OUTCOME_LABEL`), Minutes per month (categories `months.map(m => m.month)`, values `Math.ceil(callSeconds/60)`). Each `Section` that is not ok renders the `Unavailable` pattern used in `OverviewView`.

Page `apps/web/src/app/(app)/app/analytics/page.tsx` (server component, `dynamic = "force-dynamic"`): read `searchParams.days` (allow 7|30|90, default 30), compute `to = localDateKey(new Date(), tz)`, `from = addDays(to, -(days - 1))`, `Promise.allSettled` of `/v1/analytics/calls?from&to` and `/v1/analytics/usage?months=6`, `toSection` both, render the view. Sidebar: add `{ href: "/app/analytics", label: "Analytics", match: (p) => p.startsWith("/app/analytics") }` after Calls. `OverviewView` usage card hint: for pilot `Pilot ends ${formatDay(pilotEndsAt, tz)}`, for standard `Standard plan`, and when `overageSeconds > 0` append ` · ${Math.ceil(overageSeconds/60)} min over`.

- [ ] **Step 5: Run `npx vitest run apps/web` (expect PASS), gate, commit**

```bash
git add apps/web
git commit -m "feat(web): analytics page with SVG charts, analytics nav, pilot end date on the overview"
```

---

### Task 6: Plan section in Settings, pilot copy, audited settings edits

**Files:**
- Create: `apps/web/src/components/app/PlanSettings.tsx`, `apps/web/src/components/app/PlanSettings.test.tsx`
- Modify: `apps/web/src/app/(app)/app/settings/page.tsx` (new "Plan" section, remove the Plan row from Clinic), `apps/web/src/lib/content.ts:216-233,270` (pilot copy), `apps/web/src/lib/copy-guard.test.ts`, `apps/api/src/routes/me.ts:71-93` (audit row on settings PATCH), `apps/api/src/routes/me.test.ts` or the settings test file that covers `PATCH /clinics/:id` (grep `owner_required`)

**Interfaces:**
- Consumes: `UsageSummary` from `GET /v1/usage`; `GET /v1/billing` (Task 8) is NOT consumed here; `PlanSettings` takes `{ usage: UsageSummary | null; isOwner: boolean; billing: { enabled: boolean } }` so Task 8 can pass real billing state. Until then the page passes `{ enabled: false }`.
- Produces: audit action `clinic.settings.edit` with `data: { keys: string[] }` (top-level keys changed; never values).

- [ ] **Step 1: Failing tests**

Copy guard additions:

```ts
  it("pilot is described in call-minutes, not calls", () => {
    const content = readFileSync(join(root, "lib/content.ts"), "utf8");
    expect(content).toContain("500 call-minutes");
    expect(content).not.toMatch(/500 calls\b/);
  });
```

`PlanSettings.test.tsx` (jsdom): renders plan name, "500 minutes included", "Pilot ends 4 Nov 2026" (from `pilotEndsAt`), minutes used with a meter, "Overage: 12 min" when `overageSeconds: 720`; with `billing.enabled: false` there is no Upgrade button and the text "Upgrading is handled by us for now. Write to hello@muxaris.com." appears; with `billing.enabled: true, isOwner: false` the button is absent and "Only the clinic owner can change the plan." appears; with `billing.enabled: true, isOwner: true, plan: "pilot"` a button "Upgrade to Standard" exists (its click handler is wired in Task 8; here it may be a no-op `onUpgrade` prop).

API test: `PATCH /clinics/:id` with `{ settings: { recordCalls: false } }` by the owner creates one `audit_log` row with `action: "clinic.settings.edit"`, `entityId: clinicId`, `data: { keys: ["recordCalls"] }`.

- [ ] **Step 2: Run (expect FAIL), implement**

`content.ts`: pilot feature `"Up to 500 call-minutes"`; FAQ answer "…for the first 10 Bengaluru clinics, up to 500 call-minutes…".

`me.ts` PATCH: inside the transaction after the update, `await tx.insert(schema.auditLog).values({ id: newId("aud"), clinicId: id, actorId: c.get("user").id, action: "clinic.settings.edit", entity: "clinic", entityId: id, data: { keys: Object.keys(settings) } });` (import `newId` from `@muxaris/db`).

`PlanSettings.tsx` (client component, no API calls of its own; `onUpgrade?: () => void` prop):

```tsx
"use client";
import type { UsageSummary } from "@muxaris/shared";
import { formatDay } from "@/lib/dashboard";
export function PlanSettings({ usage, isOwner, billing, tz, onUpgrade }: { usage: UsageSummary | null; isOwner: boolean; billing: { enabled: boolean }; tz: string; onUpgrade?: () => void }) {
  if (!usage) return <p role="alert" className="text-danger text-sm">Couldn&apos;t load your plan. Refresh to try again.</p>;
  const used = Math.ceil(usage.callSeconds / 60);
  const ratio = usage.includedCallMinutes ? Math.min(1, used / usage.includedCallMinutes) : 0;
  const over = Math.ceil(usage.overageSeconds / 60);
  return (
    <div className="flex flex-col gap-3 text-[15px]">
      <dl>
        <div className="flex justify-between py-1"><dt className="text-muted">Plan</dt><dd>{usage.planName}{usage.priceInrMonthly ? ` · ₹${usage.priceInrMonthly.toLocaleString("en-IN")} per month` : " · ₹0"}</dd></div>
        <div className="flex justify-between py-1"><dt className="text-muted">Included</dt><dd>{usage.includedCallMinutes.toLocaleString("en-IN")} minutes included</dd></div>
        {usage.pilotEndsAt ? <div className="flex justify-between py-1"><dt className="text-muted">Pilot ends</dt><dd>Pilot ends {formatDay(usage.pilotEndsAt, tz)}</dd></div> : null}
        <div className="flex justify-between py-1"><dt className="text-muted">Used this month</dt><dd>{used} / {usage.includedCallMinutes} min</dd></div>
      </dl>
      <div role="meter" aria-label="Minutes used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)} className="h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--color-ink)_8%,white)]"><div className={`h-full rounded-full ${ratio >= 0.9 ? "bg-danger" : "bg-accent"}`} style={{ width: `${Math.round(ratio * 100)}%` }} /></div>
      {over > 0 ? <p className="text-sm">Overage: {over} min, billed at the per-minute rate agreed with you.</p> : null}
      {!billing.enabled ? (
        <p className="text-muted text-sm">Upgrading is handled by us for now. Write to hello@muxaris.com.</p>
      ) : !isOwner ? (
        <p className="text-muted text-sm">Only the clinic owner can change the plan.</p>
      ) : usage.plan === "pilot" ? (
        <button type="button" onClick={onUpgrade} className="bg-accent text-on-accent inline-flex min-h-11 items-center self-start rounded-xl px-4 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]">Upgrade to Standard</button>
      ) : (
        <p className="text-muted text-sm">You are on Standard. Cancel any time by writing to hello@muxaris.com.</p>
      )}
    </div>
  );
}
```

(Use `import { primaryBtn } from "./Modal";` for the Upgrade button's `className` instead of the inline classes above; `PatientForm.tsx` does the same.) Settings page: fetch `/v1/usage` in the existing `Promise.all` (wrap with `.catch(() => null)`), add `<Section title="Plan"><PlanSettings usage={usage} isOwner={role === "owner"} billing={{ enabled: false }} tz={clinic.timezone} /></Section>` after Clinic, and remove `<Row k="Plan" …/>` from Clinic.

- [ ] **Step 3: Run `npx vitest run apps/web apps/api` (expect PASS), gate, commit**

```bash
git add apps/web apps/api
git commit -m "feat(settings): plan section with usage, pilot end date and overage; audited settings edits; pilot copy in call-minutes"
```

---

### Task 7: Billing core: Razorpay client, signature verification, subscription lifecycle

**Files:**
- Create: `packages/core/src/billing/razorpay.ts`, `packages/core/src/billing/razorpay.test.ts`, `packages/core/src/billing/subscriptions.ts`, `packages/core/src/billing/subscriptions.test.ts`, `packages/core/src/billing/index.ts`
- Modify: `packages/core/src/index.ts` (`export * from "./billing/index.js";`)

**Interfaces:**
- Produces:

```ts
export interface RazorpayClient {
  createSubscription(input: { planId: string; totalCount: number; notes: Record<string, string> }): Promise<{ id: string; status: string; shortUrl?: string }>;
}
export function createRazorpayClient(opts: { keyId: string; keySecret: string; fetch?: typeof fetch; baseUrl?: string }): RazorpayClient;
export function verifyRazorpaySignature(rawBody: string, signature: string | undefined, webhookSecret: string): boolean; // HMAC-SHA256 hex, timing-safe
export class FakeRazorpay implements RazorpayClient {
  created: Array<{ planId: string; totalCount: number; notes: Record<string, string> }> = [];
  nextId = "sub_FAKE1";
  async createSubscription(input: { planId: string; totalCount: number; notes: Record<string, string> }) {
    this.created.push(input);
    return { id: this.nextId, status: "created" };
  }
}

export interface BillingEnv { enabled: boolean; keyId: string | null; keySecret: string | null; webhookSecret: string | null; standardPlanId: string | null }
export function billingFromEnv(src: NodeJS.ProcessEnv): BillingEnv; // BILLING_ENABLED=1 requires all four values, else throws

export async function startStandardSubscription(db: Db, rz: RazorpayClient, input: { clinicId: string; actorUserId: string; standardPlanId: string }): Promise<{ subscriptionId: string; providerSubscriptionId: string }>;
// conflict when the clinic already has a subscription in created|authenticated|active

export interface RazorpayEvent { id: string; event: string; subscription?: { id: string; status: string; plan_id: string; current_end?: number | null }; raw: Record<string, unknown> }
export function parseRazorpayEvent(body: unknown, eventId: string | undefined): RazorpayEvent; // throws CoreError validation
export async function applyRazorpayEvent(db: Db, ev: RazorpayEvent): Promise<"applied" | "duplicate" | "ignored">;
// idempotent on billing_events.id; maps subscription.activated|charged|resumed → clinics.plan='standard' + status; subscription.halted|cancelled|completed|expired|paused → plan='pilot' + status; writes audit 'clinic.plan.change' {from,to,subscriptionId} only when the plan actually changes; unknown subscription → "ignored"
```

- [ ] **Step 1: Failing tests**

`razorpay.test.ts` (no DB):

```ts
it("verifies an HMAC-SHA256 hex signature and rejects a wrong or missing one", () => {
  const secret = "whsec_test";
  const body = '{"event":"subscription.activated"}';
  const sig = createHmac("sha256", secret).update(body).digest("hex");
  expect(verifyRazorpaySignature(body, sig, secret)).toBe(true);
  expect(verifyRazorpaySignature(body, sig.replace(/^./, "0"), secret)).toBe(false);
  expect(verifyRazorpaySignature(body, undefined, secret)).toBe(false);
  expect(verifyRazorpaySignature(body, "short", secret)).toBe(false);
});
it("creates a subscription with basic auth and returns its id", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fakeFetch: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify({ id: "sub_123", status: "created" }), { status: 200 });
  };
  const rz = createRazorpayClient({ keyId: "rzp_test_k", keySecret: "s", fetch: fakeFetch });
  const r = await rz.createSubscription({ planId: "plan_std", totalCount: 12, notes: { clinicId: "cl_1" } });
  expect(r.id).toBe("sub_123");
  expect(calls[0]?.url).toBe("https://api.razorpay.com/v1/subscriptions");
  expect((calls[0]?.init.headers as Record<string, string>)["Authorization"]).toBe(`Basic ${Buffer.from("rzp_test_k:s").toString("base64")}`);
  expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({ plan_id: "plan_std", total_count: 12, customer_notify: 1 });
});
it("surfaces provider errors without the secret", async () => {
  const rz = createRazorpayClient({ keyId: "k", keySecret: "TOPSECRET", fetch: async () => new Response('{"error":{"description":"bad plan"}}', { status: 400 }) });
  await expect(rz.createSubscription({ planId: "x", totalCount: 1, notes: {} })).rejects.toThrow(/bad plan/);
  await expect(rz.createSubscription({ planId: "x", totalCount: 1, notes: {} })).rejects.not.toThrow(/TOPSECRET/);
});
it("billingFromEnv is off by default and strict when on", () => {
  expect(billingFromEnv({}).enabled).toBe(false);
  expect(() => billingFromEnv({ BILLING_ENABLED: "1" })).toThrow(/RAZORPAY_KEY_ID/);
  expect(billingFromEnv({ BILLING_ENABLED: "1", RAZORPAY_KEY_ID: "k", RAZORPAY_KEY_SECRET: "s", RAZORPAY_WEBHOOK_SECRET: "w", RAZORPAY_PLAN_ID_STANDARD: "p" })).toMatchObject({ enabled: true, standardPlanId: "p" });
});
```

`subscriptions.test.ts` (reachable-gated, `makeTestClinic`):

```ts
it("starts a subscription once and refuses a second active one", async () => {
  const rz = new FakeRazorpay();
  const r = await startStandardSubscription(db, rz, { clinicId: c.clinic.id, actorUserId: c.user.id, standardPlanId: "plan_std" });
  expect(r.providerSubscriptionId).toBe("sub_FAKE1");
  expect(rz.created[0]?.notes).toEqual({ clinicId: c.clinic.id });
  await expect(startStandardSubscription(db, rz, { clinicId: c.clinic.id, actorUserId: c.user.id, standardPlanId: "plan_std" })).rejects.toMatchObject({ code: "conflict" });
});
it("activates the plan on subscription.activated, once per event id, and reverts on cancelled", async () => {
  const ev = (id: string, event: string, status: string, subId = "sub_FAKE1") => parseRazorpayEvent({ event, payload: { subscription: { entity: { id: subId, status, plan_id: "plan_std", current_end: 1_800_000_000 } } } }, id);
  expect(await applyRazorpayEvent(db, ev("evt_1", "subscription.activated", "active"))).toBe("applied");
  expect(await applyRazorpayEvent(db, ev("evt_1", "subscription.activated", "active"))).toBe("duplicate");
  let [clinic] = await db.select().from(schema.clinics).where(eq(schema.clinics.id, c.clinic.id));
  expect(clinic?.plan).toBe("standard");
  const audits = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.clinicId, c.clinic.id), eq(schema.auditLog.action, "clinic.plan.change")));
  expect(audits).toHaveLength(1);
  expect(audits[0]?.data).toEqual({ from: "pilot", to: "standard", subscriptionId: "sub_FAKE1" });
  expect(await applyRazorpayEvent(db, ev("evt_2", "subscription.cancelled", "cancelled"))).toBe("applied");
  [clinic] = await db.select().from(schema.clinics).where(eq(schema.clinics.id, c.clinic.id));
  expect(clinic?.plan).toBe("pilot");
});
it("unknown subscription ids are acknowledged and ignored", async () => {
  expect(await applyRazorpayEvent(db, ev("evt_9", "subscription.activated", "active", "sub_NOPE"))).toBe("ignored"); // `ev` takes an optional 4th argument: the subscription id (default "sub_FAKE1")
});
it("a duplicate event id is ignored even with a different payload", async () => {
  expect(await applyRazorpayEvent(db, ev("evt_2", "subscription.activated", "active"))).toBe("duplicate");
  const [clinic] = await db.select().from(schema.clinics).where(eq(schema.clinics.id, c.clinic.id));
  expect(clinic?.plan).toBe("pilot"); // evt_2 was the cancellation; its payload cannot be replayed as an activation
});
it("parseRazorpayEvent rejects bodies without an event id, event name or subscription entity", () => {
  expect(() => parseRazorpayEvent({ event: "subscription.activated", payload: {} }, "evt_x")).toThrow(/subscription/);
  expect(() => parseRazorpayEvent({ payload: { subscription: { entity: { id: "s", status: "active", plan_id: "p" } } } }, "evt_x")).toThrow(/event/);
  expect(() => parseRazorpayEvent({ event: "subscription.activated", payload: { subscription: { entity: { id: "s", status: "active", plan_id: "p" } } } }, undefined)).toThrow(/event id/i);
});
```

- [ ] **Step 2: Run (expect FAIL), implement**

`razorpay.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";
import { CoreError } from "../services/errors.js";

export function verifyRazorpaySignature(rawBody: string, signature: string | undefined, webhookSecret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createRazorpayClient(opts: { keyId: string; keySecret: string; fetch?: typeof fetch; baseUrl?: string }): RazorpayClient {
  const f = opts.fetch ?? fetch;
  const base = opts.baseUrl ?? "https://api.razorpay.com/v1";
  const auth = `Basic ${Buffer.from(`${opts.keyId}:${opts.keySecret}`).toString("base64")}`;
  return {
    async createSubscription(input) {
      const res = await f(`${base}/subscriptions`, {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: input.planId, total_count: input.totalCount, customer_notify: 1, notes: input.notes }),
        signal: AbortSignal.timeout(10_000),
      });
      const text = await res.text();
      if (!res.ok) {
        let description = `razorpay ${res.status}`;
        try { description = (JSON.parse(text) as { error?: { description?: string } }).error?.description ?? description; } catch { /* keep status */ }
        throw new CoreError("provider", description);
      }
      const body = JSON.parse(text) as { id: string; status: string; short_url?: string };
      return { id: body.id, status: body.status, ...(body.short_url ? { shortUrl: body.short_url } : {}) };
    },
  };
}
```

Add `"provider"` to `CoreErrorCode` in `packages/core/src/services/errors.ts` (the union is `"not_found" | "conflict" | "forbidden" | "validation" | "slot_unavailable" | "clinic_limit"` today). Task 8 maps it to 502 in the API.

`billingFromEnv`: `enabled = src.BILLING_ENABLED === "1"`; when enabled, each of `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_PLAN_ID_STANDARD` must be non-empty or throw `Error("<NAME> is required when BILLING_ENABLED=1")`.

`subscriptions.ts`: `startStandardSubscription` runs in a transaction: lock the clinic row `FOR UPDATE`, select subscriptions for the clinic with status in (created, authenticated, active) → `conflict`; call `rz.createSubscription({ planId, totalCount: 12, notes: { clinicId } })` BEFORE the insert but after the lock (an external call inside a tx is acceptable here because the lock is per clinic and the call is bounded by the 10 s timeout; note this in a comment); insert `subscriptions` row `{ id: newId("sub"), clinicId, providerSubscriptionId: r.id, providerPlanId: planId, status: r.status }`; audit `clinic.subscription.start` `{ subscriptionId: r.id }`.

`applyRazorpayEvent`: transaction: `INSERT INTO billing_events … ON CONFLICT DO NOTHING RETURNING id` → no row ⇒ `"duplicate"`; find the subscription by `providerSubscriptionId` ⇒ none ⇒ `"ignored"` (the event row stays so retries are also ignored); update subscription `status` and `currentPeriodEnd` (`current_end` seconds → Date); compute `nextPlan`: `active|authenticated|charged|resumed ⇒ "standard"`, `halted|cancelled|completed|expired|paused ⇒ "pilot"`, else leave; if `nextPlan` differs from the clinic's current plan: update `clinics.plan`, audit `clinic.plan.change` `{ from, to, subscriptionId }`. Return `"applied"`. Map `ev.event` names: `subscription.authenticated`, `subscription.activated`, `subscription.charged`, `subscription.resumed`, `subscription.pending`, `subscription.halted`, `subscription.cancelled`, `subscription.completed`, `subscription.paused`, `subscription.expired`; the plan decision uses the entity `status` field, not the event name, so a late-arriving event cannot downgrade wrongly (document this in a comment).

`parseRazorpayEvent(body, eventId)`: zod schema `{ event: string, payload: { subscription: { entity: { id, status, plan_id, current_end: number|null optional } } } }`; `eventId` required (header `x-razorpay-event-id`) else `validation`.

- [ ] **Step 3: Run `npx vitest run packages/core/src/billing` (expect PASS), gate, commit**

```bash
git add packages/core
git commit -m "feat(core): Razorpay client, webhook signature verification and idempotent subscription lifecycle"
```

---

### Task 8: Billing API routes and the Upgrade flow

**Files:**
- Create: `apps/api/src/routes/billing.ts`, `apps/api/src/routes/billing.test.ts`, `apps/web/src/components/app/UpgradeButton.tsx`, `apps/web/src/components/app/UpgradeButton.test.tsx`
- Modify: `apps/api/src/env.ts`, `apps/api/src/deps.ts`, `apps/api/src/index.ts`, `apps/api/src/app.ts`, `packages/shared/src/api.ts` (`BillingStatus` DTO), `apps/web/src/app/(app)/app/settings/page.tsx`, `apps/web/src/components/app/PlanSettings.tsx` (accept `onUpgrade` from `UpgradeButton` wrapper)

**Interfaces:**
- Consumes: Task 7 exports; `requireClinic(db, "owner")`.
- Produces: `GET /v1/billing` (member) → `BillingStatus { enabled: boolean; keyId: string | null; subscription: { providerSubscriptionId: string; status: string; currentPeriodEnd: Iso | null } | null }`; `POST /v1/billing/subscriptions` (owner; 404 `billing_disabled` when off) → `{ subscriptionId: string; providerSubscriptionId: string; keyId: string }`; `POST /webhooks/razorpay` (public, raw body, header `X-Razorpay-Signature`, `X-Razorpay-Event-Id`) → 200 `{ result: "applied"|"duplicate"|"ignored" }`, 400 on bad signature or body, 404 when billing is disabled. `AppDeps.billing?: { env: BillingEnv; client: RazorpayClient | null }`.

- [ ] **Step 1: Failing route tests** (bootstrap like `usage.test.ts`; pass `billing: { env: {...enabled true, webhookSecret: "whsec"}, client: new FakeRazorpay() }` into `createApp`):

```ts
it("GET /v1/billing reports enabled state and no subscription", …expect({ enabled: true, keyId: "rzp_test_k", subscription: null }));
it("owner starts a subscription; front desk gets 403; disabled deployments get 404", …);
it("webhook: valid signature applies, wrong signature 400, duplicate event 200 duplicate, missing event id 400", async () => {
  const body = JSON.stringify({ event: "subscription.activated", payload: { subscription: { entity: { id: providerSubscriptionId, status: "active", plan_id: "plan_std", current_end: null } } } });
  const sig = createHmac("sha256", "whsec").update(body).digest("hex");
  const post = (headers: Record<string, string>) => app.request("/webhooks/razorpay", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body });
  expect((await post({ "X-Razorpay-Signature": sig, "X-Razorpay-Event-Id": "evt_a" })).status).toBe(200);
  expect((await post({ "X-Razorpay-Signature": "0" + sig.slice(1), "X-Razorpay-Event-Id": "evt_b" })).status).toBe(400);
  const dup = await post({ "X-Razorpay-Signature": sig, "X-Razorpay-Event-Id": "evt_a" });
  expect(await dup.json()).toEqual({ result: "duplicate" });
  expect((await post({ "X-Razorpay-Signature": sig })).status).toBe(400);
  // and the clinic is now standard
});
it("webhook never logs the signature or body", …capture console / the request log print and assert neither contains the signature);
```

- [ ] **Step 2: Run (expect FAIL), implement**

`env.ts`: add `billing: BillingEnv` via `billingFromEnv(src)`. `index.ts`: `billing: { env: env.billing, client: env.billing.enabled ? createRazorpayClient({ keyId: env.billing.keyId!, keySecret: env.billing.keySecret! }) : null }`. `deps.ts`: `billing?: { env: BillingEnv; client: RazorpayClient | null }`.

`routes/billing.ts`:

```ts
export function billingRoutes(db: Db, billing: { env: BillingEnv; client: RazorpayClient | null }) {
  const r = new Hono<AppEnv>();
  r.get("/billing", requireClinic(db), async (c) => {
    const clinicId = c.get("clinic").id;
    const [sub] = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.clinicId, clinicId)).orderBy(desc(schema.subscriptions.createdAt)).limit(1);
    return c.json({ enabled: billing.env.enabled, keyId: billing.env.enabled ? billing.env.keyId : null, subscription: sub ? { providerSubscriptionId: sub.providerSubscriptionId, status: sub.status, currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null } : null });
  });
  r.post("/billing/subscriptions", requireClinic(db, "owner"), async (c) => {
    if (!billing.env.enabled || !billing.client) return c.json({ error: { code: "billing_disabled", message: "billing is not enabled" } }, 404);
    const res = await startStandardSubscription(db, billing.client, { clinicId: c.get("clinic").id, actorUserId: c.get("user").id, standardPlanId: billing.env.standardPlanId! });
    return c.json({ ...res, keyId: billing.env.keyId! });
  });
  return r;
}

export function razorpayWebhook(db: Db, billing: { env: BillingEnv }) {
  const r = new Hono();
  r.post("/webhooks/razorpay", async (c) => {
    if (!billing.env.enabled || !billing.env.webhookSecret) return c.json({ error: { code: "billing_disabled", message: "billing is not enabled" } }, 404);
    const raw = await c.req.text();
    if (!verifyRazorpaySignature(raw, c.req.header("X-Razorpay-Signature"), billing.env.webhookSecret))
      return c.json({ error: { code: "bad_signature", message: "signature mismatch" } }, 400);
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return c.json({ error: { code: "validation", message: "invalid JSON" } }, 400); }
    const ev = parseRazorpayEvent(parsed, c.req.header("X-Razorpay-Event-Id"));
    return c.json({ result: await applyRazorpayEvent(db, ev) });
  });
  return r;
}
```

In `app.ts` add `provider: 502` to `CORE_STATUS` (the key the Task 7 client throws). Mount: `app.route("/", razorpayWebhook(deps.db, billing))` before the v1 group (public, with a `bodyLimit` of 64 KB), and `v1.route("/", billingRoutes(deps.db, billing))` where `const billing = deps.billing ?? { env: { enabled: false, keyId: null, keySecret: null, webhookSecret: null, standardPlanId: null }, client: null }`.

Web `UpgradeButton.tsx` (client): wraps `PlanSettings`'s `onUpgrade`: POST `/v1/billing/subscriptions`; on success load `https://checkout.razorpay.com/v1/checkout.js` once (append a `<script>` and await `onload`), then `new window.Razorpay({ key: keyId, subscription_id: providerSubscriptionId, name: "Muxaris", description: "Standard plan", handler: () => setDone(true) }).open()`; on `setDone` show "Payment received. Your plan updates within a minute." (the webhook flips the plan). Declare `window.Razorpay` with a minimal `declare global { interface Window { Razorpay?: new (opts: Record<string, unknown>) => { open(): void } } }`. Test: mock `useApi` to resolve `{ providerSubscriptionId: "sub_1", keyId: "k" }`, stub `window.Razorpay` with a constructor that records `opts` and whose `open` calls `opts.handler()`; assert the POST happened and the success text appears; a 403 from the API shows the error text. Settings page: fetch `/v1/billing` (catch → `{ enabled: false, keyId: null, subscription: null }`) and pass `billing={{ enabled: billingStatus.enabled }}` with `<UpgradeButton>` wiring; the Chrome `.csp` is not configured in this repo, so no CSP change.

- [ ] **Step 3: Run `npx vitest run apps/api apps/web` (expect PASS), gate, commit**

```bash
git add packages/shared apps/api apps/web
git commit -m "feat(billing): Razorpay subscription routes, HMAC-verified webhook, upgrade flow behind BILLING_ENABLED"
```

---

### Task 9: Env, docs, README and the e2e assertion

**Files:**
- Modify: `.env.example`, `README.md`, `docs/ARCHITECTURE.md`, `scripts/e2e-voice.ts`, `apps/web/src/lib/copy-guard.test.ts` (already passing; re-run)

- [ ] **Step 1: `.env.example`** add a Billing block:

```
# Billing (Razorpay Subscriptions). Off unless BILLING_ENABLED=1; then all four values are required.
# The webhook URL to register in the Razorpay dashboard is https://api.muxaris.com/webhooks/razorpay
# with the "subscription.*" events and the secret below.
BILLING_ENABLED=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
RAZORPAY_PLAN_ID_STANDARD=
```

- [ ] **Step 2: Docs**

`docs/ARCHITECTURE.md`: new `## Plans, usage and billing` section after Notifications: plans table seeded by migration 0005 (single source `PLAN_SEED`); the ledger (`usage_ledger` per clinic-month: call seconds, calls, LLM tokens; written at settle and by the stale-call sweep; keyed by the month the call started); the gateway rule (reject at zero remaining, in-flight calls run to `MAX_CALL_SECONDS`, overage recorded); pilot end date derived from `clinics.createdAt` + 30 days and not enforced; analytics routes and the 92-day cap; billing: `subscriptions`, `billing_events` idempotency, webhook signature check on the raw body, plan decided by the entity status, audit actions `clinic.settings.edit`, `clinic.subscription.start`, `clinic.plan.change`. Under `## Phase 5 IAM` add: API task needs the Razorpay secrets from Secrets Manager (`muxaris/razorpay`), the webhook path must be reachable publicly on the ALB, and the per-process concurrency counters need a shared store once more than one API/gateway task runs.

`README.md`: Analytics page; Plan section; billing env keys; local test of the webhook with:

```bash
BODY='{"event":"subscription.activated","payload":{"subscription":{"entity":{"id":"sub_x","status":"active","plan_id":"plan_x","current_end":null}}}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$RAZORPAY_WEBHOOK_SECRET" | sed 's/^.* //')
curl -s -X POST localhost:4000/webhooks/razorpay -H "Content-Type: application/json" -H "X-Razorpay-Signature: $SIG" -H "X-Razorpay-Event-Id: evt_local_1" --data "$BODY"
```

(the README must not print real secrets; the command reads the env var).

- [ ] **Step 3: e2e**: in `scripts/e2e-voice.ts` after the existing notification assertion, GET `/v1/usage` and assert `calls >= 1` and `callSeconds >= 1` for the current month, and that `llmInputTokens > 0` when the run used the real Bedrock provider (skip the token assertion when `PROVIDER=mock`). Print only the counts.

- [ ] **Step 4: Gate (`npx vitest run apps/web/src/lib && npm run typecheck && npm run lint && npx prettier --check .`), commit**

```bash
git add .env.example README.md docs/ARCHITECTURE.md scripts/e2e-voice.ts
git commit -m "docs: plans, usage, analytics and billing; Razorpay env and local webhook test"
```

---

## Self-review notes (controller)

- Spec coverage: analytics queries + charts (T3, T4, T5); usage ledger (T2, T4); plan limits enforced in the gateway and shown in settings (T2 ruling, T6); Razorpay subscription behind `BILLING_ENABLED` with a webhook handler (T7, T8); pilot plan default (seeded in T1, shown in T6). Spec line 112 names `llm_tokens`; the table has two columns and both are now written (T2).
- Deviations, ruled in pre-flight: in-flight calls are not clamped to the remaining plan minutes; pilot expiry is displayed and not enforced; the Standard features list is trimmed.
- Type consistency: `UsageSummary`, `CallAnalytics`, `MonthlyUsage`, `BillingStatus`, `BillingEnv`, `RazorpayClient`, `FakeRazorpay`, `startStandardSubscription`, `applyRazorpayEvent`, `parseRazorpayEvent`, `verifyRazorpaySignature`, `recordCallUsage` (new optional token fields), `pilotEndsAt`, `localDayWindow` are named identically across tasks.
- Review Focus → tests: 1 → T2 "records usage against the month the call started" (+ server settle uses `startedAt`); 2 → T7 duplicate event id; 3 → T7 unknown subscription; 4 → T4 inverted/oversized range; 5 → T8 owner-only route test and T6/T8 component tests.
- Known plan risks for the implementer to report rather than guess: `CoreError` code union may lack `provider`; `assertDateString` location; exact button classes in the web app; `drizzle-kit generate --name` flag spelling in this version (`npx drizzle-kit generate --name=plans_billing` if the double-dash form fails).
