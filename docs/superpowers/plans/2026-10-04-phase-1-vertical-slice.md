# Phase 1: Vertical Slice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in clinic owner can run onboarding (or load the demo clinic), open "Try your assistant", talk to Muxaris in the browser, and see the appointment it booked on the dashboard. Plus the real Muxaris landing page.

**Architecture:** `packages/core` holds the pure slot engine and DB-backed services used by both the API and the voice gateway. `apps/api` (Hono) verifies Cognito access tokens, resolves the clinic from `X-Clinic-Id` + `memberships`, and exposes REST for the web app. `apps/voice-gateway` runs `VoiceSession`: Sarvam STT WebSocket → Bedrock Converse stream with tools → Sarvam TTS WebSocket, with barge-in and persistence; it verifies the same Cognito token. `packages/shared` gains the gateway wire protocol. `packages/voice-sdk` is the browser client. `apps/web` gets Cognito auth pages, onboarding, a minimal dashboard, the call page and the landing page.

**Tech Stack:** Node 22, TypeScript strict ESM, Drizzle + Postgres, Hono + `@hono/zod-validator`, `aws-jwt-verify`, `ws`, `@aws-sdk/client-bedrock-runtime` (ConverseStream), `date-fns` v4 + `@date-fns/tz`, Next.js 16 + React 19 + Tailwind v4, `aws-amplify` v6 + `@aws-amplify/adapter-nextjs`, Vitest, Zod v4.

**Spec:** `docs/superpowers/specs/2026-10-04-muxaris-platform-design.md`. Vendor facts: `docs/SPIKES.md` (binding for adapter details).

## Global Constraints

- **AWS**: only profile `aws-secondary-account` / account `005533348545` / `ap-south-1`; source `scripts/lib/aws-guard.sh` before any `aws`/`cdk` command. Never the default profile.
- **Tenancy**: every DB read/write in `packages/core` services takes `clinicId` and scopes by it; `book/reschedule/cancel` verify `doctorId`, `serviceId`, `patientId`, `appointmentId` belong to that `clinicId` before writing (ledger ruling from Phase 0).
- **Cognito**: user pool `ap-south-1_AClmvvcZL`, web client `hivu498l5ai404am72c7b5e9k`, domain `muxaris-auth.auth.ap-south-1.amazoncognito.com` (ids live in `.env`; code reads `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `NEXT_PUBLIC_COGNITO_*`). Verify **access** tokens (`tokenUse: "access"`).
- **Sarvam** (from SPIKES.md): STT `wss://api.sarvam.ai/speech-to-text/ws?model=saaras:v4&mode=codemix&language-code=unknown&sample_rate=16000&input_audio_codec=pcm_s16le&vad_signals=true`, header `Api-Subscription-Key`; audio frames `{"audio":{"data":<b64>,"sample_rate":"16000","encoding":"audio/wav"}}` of 100 ms; events `{"type":"events","data":{"signal_type":"START_SPEECH"|"END_SPEECH"}}`; transcript `{"type":"data","data":{"transcript","language_code",...}}` (no partials). TTS `wss://api.sarvam.ai/text-to-speech/ws` with `config` (`speaker`, `language_code`, `model:"bulbul:v3"`, `output_audio_codec:"linear16"`, `speech_sample_rate:24000`), `text`, `flush`; `final` event per flush; one socket accepts multiple text+flush cycles; no server-side cancel → barge-in = close socket + client flush. Speaker default `shubh` (`anushka` is invalid on v3).
- **Bedrock**: Amazon Nova only, never Anthropic models (user decision 2026-10-04). `BEDROCK_MODEL_ID` default `global.amazon.nova-2-lite-v1:0` (the only Nova 2 Lite profile; `apac.amazon.nova-pro-v1:0` / `apac.amazon.nova-lite-v1:0` are the regional alternatives). ConverseStream with `toolConfig`; accumulate `toolUse.input` fragments per `contentBlockIndex`, parse at `contentBlockStop`; strip `<thinking>…</thinking>` from text before TTS; inject current date/time (Asia/Kolkata) into the system prompt.
- **Audio**: browser → gateway PCM16 mono 16 kHz binary frames (100 ms = 3200 bytes); gateway → browser PCM16 mono 24 kHz binary frames + JSON events.
- **Languages**: `en-IN, hi-IN, kn-IN, ta-IN, te-IN`. Timezone `Asia/Kolkata`. Part-of-day: morning < 12:00, afternoon 12:00–16:59, evening ≥ 17:00 local.
- **Commits**: conventional prefix; trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; never commit `.env`; branch `feat/platform`.
- **Brand**: Muxaris; Fraunces + Inter; tokens in `apps/web/src/app/globals.css`; copy adapted from the Svara reference (hero "Your front desk misses calls. Muxaris doesn’t."), pricing Pilot ₹0 / Standard ₹4,999 per month.

## Review Focus

1. **Cross-tenant ids in tool calls.** A caller (or the LLM) supplies a `doctor_id` from another clinic → `book_appointment` must fail with `not_found`, never insert. Pinned by Task 2 tests.
2. **Double booking under concurrency.** Two sessions book the same doctor/time → exactly one succeeds. Pinned by Task 2 (transaction that first locks the `doctors` row `FOR UPDATE`, then checks overlaps, then inserts; serial test with a pre-inserted conflict, plus a two-promise race test).
3. **Barge-in mid-sentence.** `START_SPEECH` while speaking → TTS socket closed, `flush_playback` sent, LLM stream cancelled, no stale audio after the event. Pinned by Task 5 fake-adapter test.
4. **Token expiry during a call.** Access tokens last 1 h; a call is capped at 10 min; the gateway verifies once from the `start` frame and never re-verifies. Pinned by Task 7 test (expired token rejected with `auth_failed`, close 4001).
5. **Unknown-language / empty transcript.** STT returns an empty transcript after `END_SPEECH` → session stays listening, no LLM call, no TTS. Pinned by Task 5 test.

---

### Task 1: `packages/core` — pure slot engine

**Files:**
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/vitest.config.ts`, `packages/core/src/index.ts`, `packages/core/src/scheduling/slot-engine.ts`, `packages/core/src/scheduling/slot-engine.test.ts`, `packages/core/src/scheduling/time.ts`

**Interfaces:**
- Produces:
```ts
export interface SlotRules { slotGrainMin: number; leadTimeMin: number; maxDaysAhead: number; allowSameDay: boolean; maxPerSlot: number }
export interface DoctorAvailability { doctorId: string; workingHours: Array<{ weekday: number; startTime: string; endTime: string }>; timeOff: Array<{ startsAt: Date; endsAt: Date }> }
export interface ServiceSpec { serviceId: string; durationMin: number; bufferMin: number }
export interface ExistingAppointment { doctorId: string; startsAt: Date; endsAt: Date /* MUST already include the appointment's own service buffer */ }
export interface FindSlotsInput { date: string /* YYYY-MM-DD */; timezone: string; now: Date; rules: SlotRules; doctors: DoctorAvailability[]; service: ServiceSpec; holidays: string[] /* YYYY-MM-DD */; appointments: ExistingAppointment[]; partOfDay?: "morning"|"afternoon"|"evening" }
export interface Slot { doctorId: string; startsAt: Date; endsAt: Date }
export function findSlots(input: FindSlotsInput): Slot[]        // sorted by startsAt then doctorId
export function partOfDayOf(d: Date, timezone: string): "morning"|"afternoon"|"evening"
export function localDateString(d: Date, timezone: string): string // YYYY-MM-DD
```
- `packages/core/package.json` deps: `@muxaris/db`, `@muxaris/shared`, `date-fns@^4`, `@date-fns/tz@^1`, `drizzle-orm`, `pg`; devDeps `vitest`, `typescript`, `@types/pg`. Exports `.`.

- [ ] **Step 1: Failing tests (write all, run, see them fail)**

```ts
// packages/core/src/scheduling/slot-engine.test.ts
import { describe, expect, it } from "vitest";
import { findSlots, partOfDayOf, localDateString, type FindSlotsInput } from "./slot-engine.js";

const TZ = "Asia/Kolkata";
const ist = (s: string) => new Date(`${s}+05:30`); // "2026-10-06T10:00:00"
const base = (): FindSlotsInput => ({
  date: "2026-10-06", // Tuesday
  timezone: TZ,
  now: ist("2026-10-05T09:00:00"),
  rules: { slotGrainMin: 15, leadTimeMin: 60, maxDaysAhead: 30, allowSameDay: true, maxPerSlot: 1 },
  doctors: [{ doctorId: "doc_a", workingHours: [{ weekday: 2, startTime: "10:00", endTime: "12:00" }], timeOff: [] }],
  service: { serviceId: "svc", durationMin: 30, bufferMin: 10 },
  holidays: [],
  appointments: [],
});

describe("findSlots", () => {
  it("generates grid slots inside working hours that fit duration+buffer", () => {
    const slots = findSlots(base());
    // 10:00..12:00, need 40 min (30+10) → starts 10:00,10:15,10:30,10:45,11:00,11:15 (11:15+40=11:55 ok), 11:30 (12:10 no)
    expect(slots.map((s) => s.startsAt.toISOString())).toEqual(
      ["10:00", "10:15", "10:30", "10:45", "11:00", "11:15"].map((t) => ist(`2026-10-06T${t}:00`).toISOString()),
    );
    expect(slots[0]!.endsAt.toISOString()).toBe(ist("2026-10-06T10:30:00").toISOString()); // endsAt excludes buffer
  });
  it("returns nothing on a day without working hours or on a holiday", () => {
    expect(findSlots({ ...base(), date: "2026-10-07" })).toEqual([]); // Wednesday, no hours
    expect(findSlots({ ...base(), holidays: ["2026-10-06"] })).toEqual([]);
  });
  it("excludes slots overlapping existing appointments including their buffer", () => {
    const slots = findSlots({ ...base(), appointments: [{ doctorId: "doc_a", startsAt: ist("2026-10-06T10:30:00"), endsAt: ist("2026-10-06T11:10:00") }] });
    const starts = slots.map((s) => s.startsAt.toISOString());
    // existing 10:30–11:00 plus its own 10 min buffer → busy 10:30–11:10 (caller passes endsAt already extended, see ExistingAppointment)
    // candidates (t, t+40): 10:00 ✗ 10:15 ✗ 10:30 ✗ 10:45 ✗ 11:00 ✗ (11:00 < 11:10) 11:15 ✓
    expect(starts).toEqual([ist("2026-10-06T11:15:00").toISOString()]);
  });
  it("excludes time off", () => {
    const slots = findSlots({ ...base(), doctors: [{ ...base().doctors[0]!, timeOff: [{ startsAt: ist("2026-10-06T10:00:00"), endsAt: ist("2026-10-06T11:00:00") }] }] });
    expect(slots.map((s) => s.startsAt.toISOString())).toEqual(["11:00", "11:15"].map((t) => ist(`2026-10-06T${t}:00`).toISOString()));
  });
  it("respects lead time and same-day rule", () => {
    // now = 10:20 same day, lead 60 min → earliest 11:20; grid candidates ≥ 11:20 are 11:30 (11:30+40 > 12:00) → none
    const sameDay = { ...base(), date: "2026-10-06", now: ist("2026-10-06T10:20:00") };
    expect(findSlots(sameDay)).toEqual([]);
    // now = 09:00 same day → earliest 10:00 → full grid
    expect(findSlots({ ...sameDay, now: ist("2026-10-06T09:00:00") })).toHaveLength(6);
    expect(findSlots({ ...sameDay, now: ist("2026-10-06T09:00:00"), rules: { ...sameDay.rules, allowSameDay: false } })).toEqual([]);
  });
  it("rejects dates beyond maxDaysAhead", () => {
    expect(findSlots({ ...base(), date: "2026-11-10" })).toEqual([]);
  });
  it("filters by part of day", () => {
    const d = { ...base(), doctors: [{ doctorId: "doc_a", workingHours: [{ weekday: 2, startTime: "10:00", endTime: "20:00" }], timeOff: [] }] };
    const afternoon = findSlots({ ...d, partOfDay: "afternoon" });
    expect(afternoon.every((s) => partOfDayOf(s.startsAt, TZ) === "afternoon")).toBe(true);
    expect(afternoon[0]!.startsAt.toISOString()).toBe(ist("2026-10-06T12:00:00").toISOString());
  });
  it("merges multiple doctors sorted by time then doctor", () => {
    const two = { ...base(), doctors: [base().doctors[0]!, { doctorId: "doc_b", workingHours: [{ weekday: 2, startTime: "10:00", endTime: "11:00" }], timeOff: [] }] };
    const s = findSlots(two);
    expect(s.slice(0, 2).map((x) => x.doctorId)).toEqual(["doc_a", "doc_b"]);
  });
});
describe("time helpers", () => {
  it("localDateString and partOfDayOf use the clinic timezone", () => {
    expect(localDateString(ist("2026-10-06T00:30:00"), TZ)).toBe("2026-10-06");
    expect(partOfDayOf(ist("2026-10-06T11:59:00"), TZ)).toBe("morning");
    expect(partOfDayOf(ist("2026-10-06T16:59:00"), TZ)).toBe("afternoon");
    expect(partOfDayOf(ist("2026-10-06T17:00:00"), TZ)).toBe("evening");
  });
});
```


- [ ] **Step 2: Run, see failures** — `npm test -w @muxaris/core` → module not found.

- [ ] **Step 3: Implement**

```ts
// packages/core/src/scheduling/time.ts
import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
export const localDateString = (d: Date, tz: string) => format(new TZDate(d, tz), "yyyy-MM-dd");
export function partOfDayOf(d: Date, tz: string): "morning" | "afternoon" | "evening" {
  const h = new TZDate(d, tz).getHours();
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}
/** Build a Date for local wall-clock time on a calendar date in tz. */
export function atLocal(date: string, hhmm: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [hh, mm] = hhmm.split(":").map(Number) as [number, number];
  return new Date(new TZDate(y, m - 1, d, hh, mm, 0, tz).getTime());
}
export const weekdayOf = (date: string, tz: string) => new TZDate(atLocal(date, "12:00", tz), tz).getDay();
```

```ts
// packages/core/src/scheduling/slot-engine.ts
import { addMinutes, differenceInCalendarDays } from "date-fns";
import { atLocal, localDateString, partOfDayOf, weekdayOf } from "./time.js";
export { localDateString, partOfDayOf } from "./time.js";
// … interfaces from the Interfaces block above …
const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) => aStart < bEnd && bStart < aEnd;

export function findSlots(i: FindSlotsInput): Slot[] {
  const today = localDateString(i.now, i.timezone);
  const dayDiff = differenceInCalendarDays(atLocal(i.date, "12:00", i.timezone), atLocal(today, "12:00", i.timezone));
  if (dayDiff < 0 || dayDiff > i.rules.maxDaysAhead) return [];
  if (dayDiff === 0 && !i.rules.allowSameDay) return [];
  if (i.holidays.includes(i.date)) return [];
  const earliest = addMinutes(i.now, i.rules.leadTimeMin);
  const need = i.service.durationMin + i.service.bufferMin;
  const weekday = weekdayOf(i.date, i.timezone);
  const out: Slot[] = [];
  for (const doc of i.doctors) {
    const busy = i.appointments.filter((a) => a.doctorId === doc.doctorId).map((a) => ({ s: a.startsAt, e: a.endsAt }));
    for (const wh of doc.workingHours.filter((w) => w.weekday === weekday)) {
      const open = atLocal(i.date, wh.startTime, i.timezone);
      const close = atLocal(i.date, wh.endTime, i.timezone);
      for (let t = open; addMinutes(t, need) <= close; t = addMinutes(t, i.rules.slotGrainMin)) {
        if (t < earliest) continue;
        const endWithBuffer = addMinutes(t, need);
        if (busy.some((b) => overlaps(t, endWithBuffer, b.s, b.e))) continue;
        if (doc.timeOff.some((o) => overlaps(t, endWithBuffer, o.startsAt, o.endsAt))) continue;
        if (i.partOfDay && partOfDayOf(t, i.timezone) !== i.partOfDay) continue;
        out.push({ doctorId: doc.doctorId, startsAt: t, endsAt: addMinutes(t, i.service.durationMin) });
      }
    }
  }
  return out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.doctorId.localeCompare(b.doctorId));
}
```

Buffer rule: `ExistingAppointment.endsAt` already includes that appointment's own buffer (Task 2 extends it when loading from the DB); the engine adds only the *new* service's buffer to each candidate.

- [ ] **Step 4: Run tests, typecheck, build; commit** `feat(core): pure slot engine with timezone-aware grid, buffers, lead time`.

---

### Task 2: `packages/core` — DB-backed services (clinics, scheduling, patients, calls)

**Files:**
- Create: `packages/core/src/services/clinics.ts`, `packages/core/src/services/scheduling.ts`, `packages/core/src/services/patients.ts`, `packages/core/src/services/calls.ts`, `packages/core/src/services/errors.ts`, `packages/core/src/services/demo.ts`, `packages/core/src/services/*.test.ts` (integration, compose Postgres)
- Modify: `packages/core/src/index.ts`

**Interfaces (all functions take `db: Db` first; all throw `CoreError` with `code`):**
```ts
export class CoreError extends Error { constructor(public code: "not_found"|"conflict"|"forbidden"|"validation", message: string) }
// clinics.ts
createClinicForUser(db, { userId, name, specialty, city, timezone?, languages? }): Promise<{ clinic, membership }>  // slugify name, uniq suffix; owner membership; default slot_rules + assistant_profile rows
getUserByCognitoSub(db, sub) / upsertUser(db, { cognitoSub, email, name? })
listMemberships(db, userId): Promise<Array<{ clinic, role }>>
getMembership(db, { userId, clinicId }): Promise<{ role } | null>
getClinicContext(db, clinicId): Promise<{ clinic, slotRules, assistant, doctors, services }>   // used by the gateway system prompt
// scheduling.ts
listDoctors(db, clinicId) / createDoctor(db, clinicId, input) / setWorkingHours(db, clinicId, doctorId, hours[])
listServices(db, clinicId) / createService(db, clinicId, input)
getSlotRules / updateSlotRules
findAvailableSlots(db, { clinicId, date, serviceId, doctorId?, partOfDay?, now? }): Promise<Slot[]>   // loads inputs, extends existing endsAt by their service buffer, calls findSlots
bookAppointment(db, { clinicId, patient: { phone, name?, preferredLanguage? }, doctorId, serviceId, startsAt, source, createdByCallId?, notes? }): Promise<Appointment>
   // in a transaction: FIRST `SELECT id FROM doctors WHERE id = $doctorId AND clinic_id = $clinicId FOR UPDATE` (serialises bookings per doctor AND is the tenant check; 0 rows → CoreError("not_found")); verify service in clinic; upsert patient by (clinicId, phone); query non-cancelled appointments of that doctor overlapping [startsAt, endsAt+buffer) → any → CoreError("conflict"); insert. Locking the overlap rows themselves would lock nothing in the empty-overlap race case, so the doctor row is the lock.
rescheduleAppointment(db, { clinicId, appointmentId, newStartsAt }) / cancelAppointment(db, { clinicId, appointmentId, reason? })
listAppointments(db, { clinicId, from, to, doctorId?, status? })
// patients.ts
upsertPatientByPhone(db, clinicId, { phone, name?, preferredLanguage? }) / findPatientByPhone / listUpcomingForPatient
// calls.ts
createCall(db, { clinicId, channel, startedByUserId?, callerPhone? }) / appendTurn(db, { callId, clinicId, seq, role, text?, toolName?, toolArgs?, toolResult?, latencyMs? }) / finishCall(db, { callId, status, outcome?, durationS, languageDetected?, metrics? }) / createCallback(db, …)
// demo.ts
loadDemoClinicData(db, clinicId): Promise<void>   // reuses the demo definitions exported by `@muxaris/db` (seed-data) and copies Sunrise doctors/hours/services/slot rules/assistant profile into an existing (empty) clinic with fresh ids; idempotent per clinic (skips if clinic already has doctors)
```

- [ ] **Step 1: Failing integration tests** covering: createClinicForUser creates owner membership + defaults; findAvailableSlots on the seeded demo clinic for next Tuesday afternoon returns slots for both doctors; bookAppointment success; bookAppointment with `doctorId` from another clinic → `not_found`; booking an overlapping time → `conflict`; race test: `Promise.allSettled([book(), book()])` same slot → one fulfilled, one `conflict`; reschedule/cancel; loadDemoClinicData idempotent. Use `seedDemoClinic` from `@muxaris/db` in `beforeAll` and create a throwaway clinic per test file with `createClinicForUser`; clean up with `delete from clinics where id = …` (cascade) in `afterAll`; end the pool.
- [ ] **Step 2: Run, fail. Step 3: Implement. Step 4: Pass, typecheck, lint; commit** `feat(core): tenant-scoped scheduling, clinic, patient and call services`.

---

### Task 3: `packages/shared` — gateway wire protocol and API DTOs

**Files:** Create `packages/shared/src/protocol.ts`, `packages/shared/src/api.ts`, tests; modify `src/index.ts`.

**Interfaces:**
```ts
// protocol.ts — JSON text frames; audio is binary (client→server PCM16 16k; server→client PCM16 24k)
export type ClientEvent = { type: "start"; token: string; clinicId: string; language?: LanguageCode } | { type: "end" } | { type: "ping" };   // token travels in the first text frame, never in the URL (ALB access logs)
export type GatewayEvent =
  | { type: "ready"; callId: string; assistantName: string; greeting: string; language: LanguageCode }
  | { type: "state"; state: "listening"|"thinking"|"speaking" }
  | { type: "transcript"; role: "user"|"assistant"; text: string; language?: string; final: true }
  | { type: "tool"; name: ToolName; status: "started"|"done"|"failed"; summary: string }
  | { type: "booking"; appointmentId: string; doctorName: string; serviceName: string; startsAt: string }
  | { type: "flush_playback" }
  | { type: "usage"; secondsUsed: number; secondsRemaining: number }
  | { type: "ended"; reason: "caller"|"assistant"|"timeout"|"cap"|"error"; outcome?: string }
  | { type: "error"; code: "auth_failed"|"forbidden"|"busy"|"quota"|"provider"|"internal"|"not_implemented"; message: string };
export const clientEventSchema = z.discriminatedUnion(…); export const gatewayEventSchema = …;
// api.ts — Zod schemas for request bodies: createClinicBody, doctorBody, workingHoursBody, serviceBody, slotRulesBody, assistantProfileBody, appointmentBody, rescheduleBody, patientBody; and response types inferred from DB rows (re-export `InferSelectModel` types as `Clinic`, `Doctor`, …).
```
- [ ] Tests: schemas parse/reject sample events; commit `feat(shared): gateway protocol and API DTO schemas`.

---

### Task 4: `apps/api` — Cognito auth, tenancy middleware, REST routes

**Files:** Create `apps/api/src/auth/verifier.ts`, `apps/api/src/auth/middleware.ts`, `apps/api/src/routes/{me,clinics,doctors,services,slots,appointments,patients,calls,onboarding,demo}.ts`, `apps/api/src/deps.ts`, tests per route; modify `apps/api/src/app.ts`, `apps/api/src/index.ts`, `apps/api/src/env.ts` (add `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `AUTH_MODE: "cognito"|"dev"`).

**Interfaces:**
- In `packages/core/src/auth/verifier.ts` (shared with the gateway in Task 7): `TokenVerifier { verify(token: string): Promise<{ sub: string; email?: string; username: string }> }`; `createCognitoVerifier({ userPoolId, clientId })` wraps `CognitoJwtVerifier.create({ userPoolId, clientId, tokenUse: "access" })` (email is not in access tokens: on first sight, fetch it with `GetUserCommand` via `@aws-sdk/client-cognito-identity-provider` using the access token; cache by sub in-process for 10 min). `createDevVerifier()` accepts tokens of the form `dev:<sub>:<email>` only when `AUTH_MODE=dev` (local/tests).
- Middleware `requireUser`: `Authorization: Bearer …` → verify → `upsertUser` → `c.set("user", …)`. `requireClinic(role?)`: reads `X-Clinic-Id`, checks membership, sets `c.set("clinic", { id, role })`; 403 `forbidden` otherwise.
- Routes (all under `/v1`, JSON, validated with `@hono/zod-validator` + schemas from `@muxaris/shared/api`): `GET /me` (user + memberships with clinic summaries), `POST /clinics`, `GET /clinics/:id` (member), `GET|POST /doctors`, `PUT /doctors/:id/hours`, `GET|POST /services`, `GET|PUT /slot-rules`, `GET|PUT /assistant`, `GET /slots?date&serviceId&doctorId&partOfDay`, `GET|POST /appointments`, `PATCH /appointments/:id/reschedule`, `POST /appointments/:id/cancel`, `GET /patients`, `GET /calls` + `GET /calls/:id` (with turns), `GET /onboarding` (step) + `PUT /onboarding/step`, `POST /demo/load` (calls `loadDemoClinicData`). Errors: `CoreError` → `{ error: { code, message } }` with 404/409/403/400; unknown → 500 logged.
- `createApp(deps: { version, corsOrigins, db, verifier })`.

- [ ] Tests (Vitest, `app.request`): use `createDevVerifier` + compose Postgres; cover: 401 without token; `/me` upserts user; create clinic → membership owner; `X-Clinic-Id` of a clinic the user is not a member of → 403; slots for demo clinic (seed the user as a member of `cl_demo_sunrise` in test setup); book → 201; conflict → 409; demo load fills a fresh clinic.
- [ ] Commit `feat(api): Cognito auth, clinic tenancy middleware and v1 routes`.

---

### Task 5: `apps/voice-gateway` — provider adapters (Sarvam STT, Sarvam TTS, Bedrock LLM) with fakes

**Files:** Create `apps/voice-gateway/src/providers/{types,sarvam-stt,sarvam-tts,bedrock-llm,fakes}.ts`, unit tests for the parsing/accumulation logic (no network), plus `scripts/spike`-style manual check scripts `apps/voice-gateway/src/providers/__manual__/*.ts` (not in vitest include).

**Interfaces:**
```ts
export interface SttStream { sendAudio(pcm16k: Buffer): void; end(): void; on(ev: "speech_start"|"speech_end", cb: () => void): void; on(ev: "transcript", cb: (t: { text: string; language?: string }) => void): void; on(ev: "error", cb: (e: Error) => void): void; close(): void }
export interface SttProvider { open(): Promise<SttStream> }
export interface TtsUtterance { audio: AsyncIterable<Buffer> /* PCM16 24k */; cancel(): void }
export interface TtsProvider { speak(text: string, opts: { language: LanguageCode; speaker: string }): TtsUtterance }   // one socket per utterance: config → text → flush → read audio until `final` → close
export type LlmDelta = { type: "text"; text: string } | { type: "tool_call"; id: string; name: ToolName; input: unknown } | { type: "done"; stopReason: string; usage?: { inputTokens: number; outputTokens: number } };
export interface LlmProvider { stream(req: { system: string; messages: ConverseMessage[]; tools: ToolDefinition[]; signal: AbortSignal }): AsyncIterable<LlmDelta> }
```
- Sarvam STT: implement per SPIKES.md; buffer incoming audio into exact 3200-byte frames; base64 per frame; map `events`/`data`/`error`; reconnect is NOT in scope (emit `error`).
- Sarvam TTS: per SPIKES.md; `config` → `text` → `flush`; decode audio messages (base64 linear16); resolve on `final`; `cancel()` closes the socket and ends the iterable.
- Bedrock: `ConverseStreamCommand`; accumulate `toolUse.input` per `contentBlockIndex`; parse at `contentBlockStop`; strip `<thinking>…</thinking>` (including partial tags across deltas: buffer text until `>` of a closing tag or until a sentence boundary when no `<thinking` prefix present); yield `done` on `messageStop` with `metadata.usage`.
- Fakes: `FakeStt` (script of `{ afterMs, event }`), `FakeTts` (yields N silent chunks with delay, cancellable), `FakeLlm` (scripted deltas per turn, keyed by last user text).
- [ ] Unit tests: STT framing splits/concatenates into 3200-byte frames; STT message mapping; TTS message sequencing (mock `ws` with an EventEmitter); Bedrock accumulation + thinking-strip across split deltas; fakes behave. Commit `feat(voice-gateway): Sarvam STT/TTS and Bedrock Converse adapters with fakes`.

---

### Task 6: `apps/voice-gateway` — `VoiceSession` engine and tool execution

**Files:** Create `apps/voice-gateway/src/session/{voice-session,prompt,tools,transport,sentence-chunker}.ts`, `apps/voice-gateway/src/session/voice-session.test.ts`, `apps/voice-gateway/src/session/sentence-chunker.test.ts`.

**Interfaces:**
```ts
export interface MediaTransport { onInboundAudio(cb: (pcm16k: Buffer) => void): void; sendAudio(pcm24k: Buffer): void; sendEvent(e: GatewayEvent): void; onClientEvent(cb: (e: ClientEvent) => void): void; onClose(cb: () => void): void; close(): void }
export interface SessionContext { clinic: ClinicContext /* from getClinicContext */; callId: string; language: LanguageCode; now: () => Date; maxDurationS: number /* 600 */; secondsRemaining: number }
export class VoiceSession { constructor(deps: { transport; stt: SttProvider; tts: TtsProvider; llm: LlmProvider; db: Db; ctx: SessionContext; log }); start(): Promise<void>; end(reason): Promise<void> }
export function buildSystemPrompt(ctx: ClinicContext, nowIso: string, language: LanguageCode): string
export function executeTool(db, ctx, name: ToolName, input: unknown): Promise<{ result: unknown; event?: GatewayEvent }>   // validates with toolInputSchemas; maps to core services; never throws (returns { result: { error } })
export function* chunkSentences(stream: AsyncIterable<string>): AsyncIterable<string>   // yields at ., ?, !, । or 120 chars
```
- State machine: `greeting` (TTS greeting from `assistant.greeting[language]`) → `listening` (STT open; audio forwarded) → on `speech_end` + non-empty transcript → `thinking` (append user turn; LLM stream; text deltas → sentence chunker → TTS; tool calls → execute → append tool turn → continue LLM with `toolResult`) → `speaking` → back to `listening` after the last `final`. `speech_start` during `speaking`/`thinking` → abort LLM (`AbortController`), cancel current TTS utterance, drop queued sentences, `sendEvent({type:"flush_playback"})`, go `listening`. `end_call` tool → speak the closing sentence, then `end("assistant")`. Timer: `maxDurationS` → `end("timeout")`; `secondsRemaining` → `end("cap")`. Every state change emits `state`. Persist: `createCall` done by the server before constructing the session; session calls `appendTurn` for user/assistant/tool turns and `finishCall` on end with `outcome` derived from tools used (`booked` if `book_appointment` succeeded, `callback` if `request_callback`, `handoff` if `transfer_to_staff`, `info` otherwise, `abandoned` if no user turn).
- System prompt (from Svara reference, parameterised): receptionist persona for `clinic.name` in `clinic.city`; doctors with titles and languages; services with durations and prices; opening hours per weekday; `assistant.faq` and `knowledge`; rules: reply in the caller's language (detected from `language_code`), ≤ 2 short sentences, never give medical advice, emergencies/severe pain/billing disputes → `transfer_to_staff`, always `find_slots` before offering times and only offer times returned by it, collect name + 10-digit mobile before `book_appointment`, confirm the exact slot verbally before booking, use real ids from `get_clinic_info`/`find_slots` (never invent `service_id`/`doctor_id`), after booking say a confirmation will be sent; current date/time/timezone injected.
- [ ] Tests with fakes: (a) scripted conversation "I want a cleaning tomorrow afternoon" → FakeLlm calls `find_slots` then `book_appointment` (with ids taken from the tool results the test passes back) → an `appointments` row exists for the demo clinic and a `booking` event was sent; (b) barge-in: FakeTts emits slowly, FakeStt fires `speech_start` mid-utterance → `flush_playback` sent, utterance cancelled, no further audio frames after the event; (c) empty transcript → no LLM call; (d) `end_call` → `ended` with reason `assistant` and `finishCall` outcome `booked`; (e) max duration → `ended: timeout`. Commit `feat(voice-gateway): VoiceSession engine with barge-in, tool execution and persistence`.

---

### Task 7: `apps/voice-gateway` — WebSocket server wiring and auth

**Files:** Modify `apps/voice-gateway/src/server.ts`, `src/env.ts`, `src/index.ts`; create `src/ws-transport.ts`, `src/auth.ts` (imports `TokenVerifier`, `createCognitoVerifier`, `createDevVerifier` from `@muxaris/core`, created in Task 4), `src/server.test.ts` (extend).

- Connect: `GET /v1/session` (no query params). The client must send `{type:"start", token, clinicId, language}` as the first text frame within 5 s, else close 4001. Then verify token → `getMembership` → load `getClinicContext` → concurrency guard (per clinic `plans.maxConcurrentCalls`, global `MAX_SESSIONS` default 15 < Sarvam's 20) → usage cap (`usage_ledger` month vs `plans.includedCallMinutes`) → `createCall` → `VoiceSession.start()`. Failures send one `error` event and close with 4001 (auth), 4003 (forbidden), 4029 (busy/quota).
- `WsTransport` implements `MediaTransport` over `ws`: binary frames = audio, text frames = `clientEventSchema`.
- On close: `session.end("caller")`, update `usage_ledger` (`call_seconds += duration`).
- [ ] Tests: no `start` frame within the deadline → 4001; expired/invalid token → `auth_failed` + close 4001; valid dev token but non-member clinic → 4003; a token in the URL query string is ignored; happy path with fakes injected via `createServer({ providers })` → receives `ready`, sends 1 s of silence frames, receives `state` events. Commit `feat(voice-gateway): authenticated /v1/session with concurrency and usage guards`.

---

### Task 8: `packages/voice-sdk` — browser client and React hook

**Files:** Create `packages/voice-sdk/package.json` (peer `react`), `src/index.ts`, `src/client.ts`, `src/audio-capture.ts` (+ `worklet.ts` inlined as a Blob URL), `src/playback.ts`, `src/use-voice-call.ts`, tests for pure parts (PCM conversion, event parsing) with Vitest + jsdom.

**Interfaces:**
```ts
export class VoiceClient { constructor(opts: { url: string; token: string; clinicId: string; language: LanguageCode }); connect(): Promise<void> /* opens WS, sends the `start` frame with token+clinicId+language first */; end(): void; on(ev: GatewayEvent["type"] | "audio", cb): () => void }
export function useVoiceCall(opts): { phase: "idle"|"connecting"|"live"|"ended"|"error"; state: "listening"|"thinking"|"speaking"|null; lines: Array<{ role; text }>; tools: Array<{ name; status; summary }>; booking: BookingEvent|null; secondsRemaining: number|null; error: string|null; start(): Promise<void>; stop(): void }
```
- Capture: `AudioWorkletNode` (fallback `ScriptProcessorNode` as in the Svara reference) with `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } })`; downsample to 16 kHz Int16; send 100 ms frames. Playback: queue PCM 24 kHz into `AudioContext` buffers with scheduled `start` (port the Svara `playChunk` logic); `flush_playback` stops all sources and resets the clock.
- [ ] Commit `feat(voice-sdk): browser mic capture, playback with barge-in flush, React hook`.

---

### Task 9: `apps/web` — Cognito auth (Amplify), API client, protected layout

**Files:** Create `apps/web/src/lib/amplify.ts` (configure from `env`), `apps/web/src/lib/amplify-server.ts` (`createServerRunner`), `apps/web/src/lib/api.ts` (typed fetch with access token; server + client variants), `apps/web/src/proxy.ts` (Next 16 renamed `middleware.ts` to `proxy.ts`; the file exports `export function proxy(request: NextRequest)` plus `config.matcher`; a `middleware.ts` file only logs a deprecation warning and both files together fail the build), `apps/web/src/app/(auth)/{sign-in,sign-up,verify,forgot-password}/page.tsx`, `apps/web/src/app/auth/callback/page.tsx` (Google code exchange handled by Amplify `Hub` listener), `apps/web/src/components/auth/*`, `apps/web/src/app/(app)/layout.tsx` (loads `/v1/me`; no memberships → redirect `/onboarding`; clinic switcher when > 1), tests for `api.ts` error mapping.

- Pages use `signUp`, `confirmSignUp`, `signIn`, `resetPassword`, `confirmResetPassword`, `signInWithRedirect({ provider: "Google" })` from `aws-amplify/auth`; styled with the brand tokens (paper card, Fraunces headings, Inter inputs, green primary button); show Cognito error messages verbatim but friendly; "Continue with Google" shown only when `NEXT_PUBLIC_GOOGLE_ENABLED=1`.
- Proxy (`src/proxy.ts`): `authenticatedUser` from `@aws-amplify/adapter-nextjs` guards `/app/:path*` and `/onboarding/:path*`; redirect to `/sign-in?next=…`. If `authenticatedUser` turns out not to run in the proxy runtime, fall back to a cookie-presence check in `proxy.ts` and do the real session check in the `(app)` layout with `runWithAmplifyServerContext` + `fetchAuthSession`; record which path was taken in the report.
- [ ] Commit `feat(web): Cognito sign-up/sign-in flows, API client and protected app shell`.

---

### Task 10: `apps/web` — onboarding wizard

**Files:** `apps/web/src/app/onboarding/{layout,page}.tsx`, `src/components/onboarding/{StepBasics,StepDoctors,StepServices,StepAssistant,StepReview,Progress}.tsx`, `src/lib/onboarding.ts` (step order, persistence via `PUT /v1/onboarding/step`).

- Steps: 1 Basics (clinic name, specialty select, city select, languages multi-select, phone) → `POST /v1/clinics` on first submit; 2 Doctors (name, title, languages, working hours grid Mon–Sun with copy-to-all) → `POST /v1/doctors` + `PUT hours`; 3 Services (table with defaults for dental: Consultation 20, Cleaning 30, Filling 45, Root canal 60, Ortho consult 30, Whitening 60; durations, buffer, price, AI-bookable) + slot rules (grain, lead time, days ahead, same-day) → `POST /v1/services`, `PUT /v1/slot-rules`; 4 Assistant (name default "Muxaris", greeting per selected language with "Generate from template" button producing "Hello, {clinic}. How may I help you today?" translations from a static table for the five languages, voice select per language from `BULBUL_V3_SPEAKERS` in `@muxaris/shared` with a "Preview" button calling `POST /v1/assistant/preview` (added in this task: returns a short TTS clip as audio/wav using the REST endpoint), handoff number, FAQ pairs) → `PUT /v1/assistant`; 5 Review → "Finish" sets step `done` and routes to `/app/assistant/try`. Top of step 1: "Load demo clinic" button → `POST /v1/clinics` with Sunrise basics then `POST /v1/demo/load` → jump to Review.
- [ ] Commit `feat(web): five-step onboarding with demo clinic shortcut`.

---

### Task 11: `apps/web` — dashboard shell, overview, appointments, "Try your assistant"

**Files:** `apps/web/src/app/(app)/app/{layout,page}.tsx`, `app/appointments/page.tsx`, `app/assistant/try/page.tsx`, `app/calls/page.tsx` (list only), `src/components/app/{Sidebar,Topbar,KpiCard,AppointmentList,DayCalendar,CallList,TryCall,TranscriptPane,ToolTimeline,BookingCard}.tsx`.

- Sidebar: Overview, Appointments, Calls, Assistant, Settings (settings is a stub page with clinic basics + doctors + services read-only tables in this phase). Overview: today's appointments, last 5 calls, KPIs (calls today, booked today, minutes used this month from `/v1/usage` — add `GET /v1/usage` to the API in this task). Appointments: day/week switch, list grouped by doctor, create (modal using `/v1/slots`), cancel, reschedule. Try page: language picker (clinic languages), big "Start call" button, live state dot (listening/thinking/speaking), transcript pane, tool timeline ("Checking Dr. Rao's slots…"), booking card on `booking`, remaining minutes, "End call". Reuses `useVoiceCall` from `@muxaris/voice-sdk`.
- [ ] Commit `feat(web): dashboard shell, appointments and in-browser call page`.

---

### Task 12: `apps/web` — landing page, pricing, FAQ, legal, demo request

**Files:** `apps/web/src/app/page.tsx`, `pricing/page.tsx`, `faq/page.tsx`, `privacy/page.tsx`, `terms/page.tsx`, `src/components/marketing/{Nav,Hero,LanguageMarquee,ProblemStats,LiveDemo,HowItWorks,Languages,WhatItHandles,WhoItsFor,Pricing,Faq,FinalCta,DemoForm,Footer,SamplePlayer,Reveal}.tsx`, `src/lib/content.ts` (ported from Svara, re-branded), `apps/web/src/app/sitemap.ts`, `robots.ts`, OG image route using `og-card.webp`.

- Copy: port the Svara structure (hero, marquee of language greetings with the real audio clips, problem stats, live demo (scripted: three stages Call answered → Slot booked → Confirmation sent; signed-in users get a "Try it live" link to `/app/assistant/try`), how it works (3 steps with `step-*.webp`), languages, "What it handles" dark bento, who it's for (5 specialties with `spec-*.webp`), pricing (Pilot ₹0 for 30 days, first 10 Bengaluru clinics, up to 500 calls; Standard ₹4,999/month), FAQ (8), final CTA with the demo form → `POST /v1/demo-requests` (public API route added in this task, rate-limited by IP in-memory)). Replace every "Svara" with "Muxaris" and "WhatsApp confirmation" with "confirmation by WhatsApp or email" (honest about Phase 1). Privacy/Terms rewritten for Muxaris (no Langfuse), India data residency, consent at call start.
- Design: follow `docs/BRAND.md`; use the `frontend-design` skill guidance (distinctive, not template); light paper sections alternating with ink sections; Fraunces italics for asides; motion via CSS + `IntersectionObserver` reveal (port `Reveal`), `prefers-reduced-motion` respected; Lighthouse ≥ 90 performance on mobile.
- [ ] Commit `feat(web): Muxaris landing, pricing, FAQ, legal pages and demo request`.

---

### Task 13: Local end-to-end verification, dev script, docs

- `scripts/dev.sh` already runs everything; add `AUTH_MODE=cognito` default and document `AUTH_MODE=dev` for API tests.
- Manual E2E (controller performs with the browser tools): sign up with a real email → verify code → onboarding with "Load demo clinic" → `/app/assistant/try` → speak "I want a teeth cleaning tomorrow afternoon" → hear the reply → confirm slot → booking card → `/app/appointments` shows it. Record a GIF via the Chrome tools.
- README: update "Local setup" with Cognito ids and `AUTH_MODE`; add "Try the assistant" section. `.env.example`: add `BEDROCK_MODEL_ID`, `AUTH_MODE`, `MAX_SESSIONS`, `NEXT_PUBLIC_GOOGLE_ENABLED`.
- [ ] Commit `docs: Phase 1 local run instructions`.

## Phase 1 exit criteria
- Root `npm test`, `typecheck`, `build`, `lint`, `prettier --check` pass.
- Slot engine and services tests cover cross-tenant ids, conflicts (incl. race), buffers, lead time, same-day, part-of-day.
- Gateway session test books an appointment with fake providers; barge-in test passes.
- Manual browser E2E above succeeds with real Sarvam + Bedrock (Nova 2 Lite) from `scripts/dev.sh`.
- Landing page renders at `/` with generated assets and audio; Lighthouse mobile performance ≥ 90.
