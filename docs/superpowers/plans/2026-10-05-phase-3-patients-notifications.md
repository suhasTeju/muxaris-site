# Phase 3: Patients, Notifications and Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give clinics a patient record (CRUD, auto-created from calls, visit history, no-show marking, audited phone reveal), a notification outbox that sends appointment confirmations and reminders by email today and by SMS/WhatsApp behind flags, in all five languages, with an outbox UI and per-clinic settings.

**Architecture:** The `notifications` table is a transactional outbox: core writes a fully rendered row (subject + body, chosen channel, recipient) inside the same transaction as the booking change, and a new `workers/notifier` package claims queued rows with `FOR UPDATE SKIP LOCKED`, sends them through a provider interface (SES live, SNS/WhatsApp behind flags, console locally) and records sent/failed/skipped with retries. The same worker runs the reminder sweep (24 h and 2 h windows stamped on the appointment row) and both run as a local dev loop now and as scheduled Lambda handlers in Phase 5. Phone numbers never leave the server except through audited reveal endpoints; patient email is editable by staff and is the only live channel.

**Tech Stack:** Drizzle + Postgres 16, Hono + zod v4, Next 16 App Router, `@aws-sdk/client-sesv2`, `@aws-sdk/client-sns`, WhatsApp Cloud API over `fetch`, CDK `aws-ses` EmailIdentity, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-04-muxaris-platform-design.md` (Phase 3 at lines 191-194; notifier/reminders at 152-154; data model 105-111; messaging decisions 25, 40, 216).

## Global Constraints

- Node 22, npm workspaces (pnpm is broken). Build order `npm run build:packages` = shared → db → core → voice-sdk → storage. Root gate before every commit of a task: `npm run typecheck && npm run lint && npx prettier --check .`; `npm test` needs Postgres on 5433 (`docker compose up -d postgres && npm run db:migrate`). Never commit with `--no-verify`.
- Strict TypeScript (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`); ESLint `@typescript-eslint/no-explicit-any` is an error (tests may use the existing `// eslint-disable-next-line` + `type J = any` idiom); Prettier printWidth 100; ESM imports end in `.js`.
- AWS: only profile `aws-secondary-account` (account 005533348545, ap-south-1). Every `aws`/`cdk` call goes through `scripts/lib/aws-guard.sh` or `infra/scripts/cdk.sh`. Never the default profile. Bedrock: Amazon Nova only, never Anthropic models.
- Secrets live in `.env` / Secrets Manager; never commit `.env`; never print env values. Logs never contain phone numbers, emails, names, message bodies, transcripts, tokens or presigned URLs: log ids, counts, channel, template kind and error names only.
- Phone numbers: the raw value never leaves core except via `revealPatientPhone` / `revealCallbackPhone`, which write an `audit_log` row. All list/get DTOs carry `phoneMasked` (`maskPhone` from `@muxaris/shared`). Notification recipients are exposed only as `toMasked`.
- Copy: web copy is checked by `apps/web/src/lib/copy-guard.test.ts`; never claim SMS or WhatsApp delivery is live; email claims must be qualified by "email on file". Phone channel and WhatsApp remain "coming soon".
- Tests: Postgres-gated suites use the `dbReachable()` + `(reachable ? describe : describe.skip)` idiom and clean up their clinics/users in `afterAll`. Web component tests use `// @vitest-environment jsdom`, Testing Library and the hoisted `vi.mock("@/lib/api-client")` idiom. No test asserts nothing.
- Commits: conventional prefix (`feat(core): …`, `test(api): …`), trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Implementers never dispatch subagents.
- Language strings in templates: the controller wrote the Hindi, Kannada, Tamil and Telugu copy; keep them verbatim and flag any doubt in the report instead of rewriting them.

## Review Focus

1. A patient email saved with surrounding whitespace or without an `@` must be rejected or trimmed, never stored and mailed to. Test pinned in Task 5 (PATCH `/v1/patients/:id` with `" bad "` → 400; `" a@b.co "` → stored trimmed).
2. Rescheduling after a reminder was already sent must re-arm both reminders for the new time. Test pinned in Task 4 (`rescheduleAppointment` clears `reminder24hSentAt` and `reminder2hSentAt`).
3. An appointment booked 90 minutes ahead must get a confirmation and not also an immediate 2 h reminder. Test pinned in Task 4 (`enqueueDueReminders` skips rows created less than 30 minutes ago).
4. A worker that crashes mid-send must not lose or double-send a row: a claimed row is invisible to a concurrent claim and reappears after the retry delay. Test pinned in Task 4 (two sequential claims; second returns nothing until `now` passes `retryAfterMs`).
5. A provider rejection (SES sandbox, unverified recipient) must end as `failed` with the error name after 5 attempts, with no recipient in logs. Test pinned in Task 7 (`deliverOnce` with a throwing provider).
6. Revealing a callback phone after the 90-day callback purge must refuse rather than return the masked string as if it were a number. Test pinned in Task 2 (`revealCallbackPhone` on a purged row throws `conflict`).

---

### Task 1: Schema migration and shared contracts

**Files:**
- Modify: `packages/db/src/schema/patients.ts`, `packages/db/src/schema/messaging.ts`, `packages/db/src/schema/calls.ts` (callbacks table)
- Create: `packages/db/drizzle/0004_patients_notifications.sql` (+ `meta/0004_snapshot.json`, journal entry, generated by drizzle-kit)
- Modify: `packages/shared/src/api.ts`
- Create: `packages/shared/src/notifications.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/notifications.test.ts`, `packages/shared/src/api.test.ts` (exists; add cases)

**Interfaces:**
- Consumes: `maskPhone`, `LANGUAGE_CODES`, `indianPhone` from `packages/shared/src/api.ts` / `languages.ts`.
- Produces (used by every later task):
  - DB columns: `patients.email text null`, `patients.updated_at timestamptz not null default now()`; `notifications.patient_id text null`, `notifications.attempts integer not null default 0`, `notifications.next_attempt_at timestamptz null`, index `notifications_status_next_idx (status, next_attempt_at)`, index `notifications_appointment_idx (appointment_id)`; `callbacks.purged_at timestamptz null`.
  - `NOTIFICATION_KINDS`, `NotificationKind`, `NOTIFICATION_KIND_LABEL`, `ChannelFlags`, `channelFlagsFromEnv(src)`, `maskEmail(email)`, `clinicNotificationSettings(settings)`, `ClinicSettings`, `clinicSettingsPatchBody`, `patientBody` (+`email`), `patientPatchBody`, `patientsQuery`, `appointmentStatusBody`, `notificationsQuery`, DTOs `Patient` (masked), `PatientDetail`, `Notification`.

- [ ] **Step 1: Write the failing shared tests**

Create `packages/shared/src/notifications.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  channelFlagsFromEnv,
  clinicNotificationSettings,
  clinicSettingsPatchBody,
  maskEmail,
  NOTIFICATION_KINDS,
  patientPatchBody,
} from "./index.js";

describe("notification contracts", () => {
  it("lists the five template kinds", () => {
    expect(NOTIFICATION_KINDS).toEqual([
      "appointment_confirmed",
      "appointment_rescheduled",
      "appointment_cancelled",
      "reminder_24h",
      "reminder_2h",
    ]);
  });
  it("channel flags default to off and accept 1/true", () => {
    expect(channelFlagsFromEnv({})).toEqual({ sms: false, whatsapp: false });
    expect(channelFlagsFromEnv({ SMS_ENABLED: "1", WHATSAPP_ENABLED: "true" })).toEqual({
      sms: true,
      whatsapp: true,
    });
    expect(channelFlagsFromEnv({ SMS_ENABLED: "0" })).toEqual({ sms: false, whatsapp: false });
  });
  it("masks emails to first letter + domain", () => {
    expect(maskEmail("ravi.kumar@gmail.com")).toBe("r•••@gmail.com");
    expect(maskEmail("a@b.co")).toBe("a•••@b.co");
    expect(maskEmail("nonsense")).toBe("•••");
  });
  it("notification settings default to on", () => {
    expect(clinicNotificationSettings(null)).toEqual({ confirmations: true, reminders: true });
    expect(clinicNotificationSettings({ notifications: { reminders: false } })).toEqual({
      confirmations: true,
      reminders: false,
    });
  });
  it("settings patch accepts nested notification toggles", () => {
    const r = clinicSettingsPatchBody.safeParse({
      settings: { notifications: { confirmations: false } },
    });
    expect(r.success).toBe(true);
    expect(clinicSettingsPatchBody.safeParse({ settings: { notifications: { x: 1 } } }).success).toBe(
      false,
    );
  });
  it("patient patch requires at least one field, trims and validates email", () => {
    expect(patientPatchBody.safeParse({}).success).toBe(false);
    const ok = patientPatchBody.safeParse({ email: " a@b.co " });
    expect(ok.success && ok.data.email).toBe("a@b.co");
    expect(patientPatchBody.safeParse({ email: "bad" }).success).toBe(false);
    expect(patientPatchBody.safeParse({ email: null }).success).toBe(true);
    expect(patientPatchBody.safeParse({ phone: "+919876543210" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/shared/src/notifications.test.ts`
Expected: FAIL (`channelFlagsFromEnv` etc. are not exported).

- [ ] **Step 3: Schema changes**

In `packages/db/src/schema/patients.ts` add after `notes`:

```ts
    email: text("email"),
```

and after `createdAt`:

```ts
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
```

In `packages/db/src/schema/messaging.ts` add `integer` to the import and these columns after `appointmentId`:

```ts
    patientId: text("patient_id"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
```

and extend the index list:

```ts
  (t) => [
    index("notifications_clinic_created_idx").on(t.clinicId, t.createdAt),
    index("notifications_status_next_idx").on(t.status, t.nextAttemptAt),
    index("notifications_appointment_idx").on(t.appointmentId),
  ],
```

In `packages/db/src/schema/calls.ts`, in the `callbacks` table after `doneAt`:

```ts
    /** Set by the 90-day callback purge: phone is masked in place, reason and note cleared. */
    purgedAt: timestamp("purged_at", { withTimezone: true }),
```

- [ ] **Step 4: Generate the migration**

Run from `packages/db`: `npx drizzle-kit generate --name patients_notifications`
Expected: creates `drizzle/0004_patients_notifications.sql` with exactly these statements (order may differ):

```sql
ALTER TABLE "callbacks" ADD COLUMN "purged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "patient_id" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "next_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "notifications_status_next_idx" ON "notifications" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "notifications_appointment_idx" ON "notifications" USING btree ("appointment_id");
```

If drizzle-kit emits anything else (a drop, a type change), stop and report BLOCKED with the diff. Then run `npm run db:migrate` (Postgres up) and confirm `\d patients` shows `email`.

- [ ] **Step 5: Shared contracts**

Create `packages/shared/src/notifications.ts`:

```ts
export const NOTIFICATION_KINDS = [
  "appointment_confirmed",
  "appointment_rescheduled",
  "appointment_cancelled",
  "reminder_24h",
  "reminder_2h",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_KIND_LABEL: Record<NotificationKind, string> = {
  appointment_confirmed: "Confirmation",
  appointment_rescheduled: "Rescheduled",
  appointment_cancelled: "Cancelled",
  reminder_24h: "Reminder (day before)",
  reminder_2h: "Reminder (2 hours)",
};

export const NOTIFICATION_CHANNELS = ["email", "sms", "whatsapp"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
export const NOTIFICATION_STATUSES = ["queued", "sent", "failed", "skipped"] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

/** Platform-level channel switches (env), not clinic settings. Email is always on. */
export interface ChannelFlags {
  sms: boolean;
  whatsapp: boolean;
}
const on = (v: string | undefined) => v === "1" || v?.toLowerCase() === "true";
export function channelFlagsFromEnv(src: Record<string, string | undefined>): ChannelFlags {
  return { sms: on(src["SMS_ENABLED"]), whatsapp: on(src["WHATSAPP_ENABLED"]) };
}

/** Why a notification was skipped; shown to staff in the outbox. */
export const SKIP_REASONS = {
  no_contact: "No email on file",
  channel_disabled: "Channel not enabled",
  clinic_disabled: "Turned off in Settings",
} as const;
export type SkipReason = keyof typeof SKIP_REASONS;

export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "•••";
  return `${email.slice(0, 1)}•••${email.slice(at)}`;
}
```

In `packages/shared/src/index.ts` add `export * from "./notifications.js";`.

In `packages/shared/src/api.ts`:

Replace the `ClinicSettings` / `clinicSettingsPatchBody` block with:

```ts
export const clinicSettingsPatchBody = z.object({
  settings: z
    .object({
      recordCalls: z.boolean(),
      notifications: z
        .object({ confirmations: z.boolean(), reminders: z.boolean() })
        .partial()
        .strict(),
    })
    .partial()
    .strict(),
});
export type ClinicSettingsPatchBody = z.infer<typeof clinicSettingsPatchBody>;

export interface ClinicSettings {
  recordCalls: boolean;
  notifications: { confirmations: boolean; reminders: boolean };
}

/** Both default to on; one definition for api, web, core. */
export function clinicNotificationSettings(
  settings: Record<string, unknown> | null | undefined,
): ClinicSettings["notifications"] {
  const n = (settings?.["notifications"] ?? {}) as Record<string, unknown>;
  return { confirmations: n["confirmations"] !== false, reminders: n["reminders"] !== false };
}
```

Replace `patientBody` with:

```ts
const email = z.email().trim().max(254);
export const patientBody = z.object({
  phone: indianPhone,
  name: name().nullish(),
  email: email.nullish(),
  preferredLanguage: z.enum(LANGUAGE_CODES).optional(),
  dob: dateStr.nullish(),
  notes: text().nullish(),
});
export const patientPatchBody = patientBody
  .omit({ phone: true })
  .partial()
  .strict()
  .refine((b) => Object.keys(b).length > 0, "Provide at least one field");
export type PatientPatchBody = z.infer<typeof patientPatchBody>;
export const patientsQuery = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export const appointmentStatusBody = z.object({ status: z.enum(["completed", "no_show"]) });
export const notificationsQuery = z.object({
  status: z.enum(NOTIFICATION_STATUSES).optional(),
  appointmentId: z.string().min(1).max(64).optional(),
  patientId: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
```

(`z.email()` is zod v4; import `NOTIFICATION_STATUSES`, `NotificationChannel`, `NotificationKind`, `NotificationStatus` from `./notifications.js` at the top of `api.ts`.)

Replace the `Patient` DTO with:

```ts
/** Patient as the API returns it: the raw phone never leaves the server. */
export interface Patient {
  id: string;
  clinicId: string;
  phoneMasked: string;
  name: string | null;
  email: string | null;
  preferredLanguage: string;
  dob: string | null;
  notes: string | null;
  consentAt: Iso | null;
  createdAt: Iso;
  updatedAt: Iso;
}
export interface Notification {
  id: string;
  clinicId: string;
  patientId: string | null;
  appointmentId: string | null;
  channel: NotificationChannel;
  template: NotificationKind;
  language: string;
  toMasked: string;
  status: NotificationStatus;
  error: string | null;
  providerId: string | null;
  attempts: number;
  nextAttemptAt: Iso | null;
  payload: { subject?: string; body?: string };
  createdAt: Iso;
  sentAt: Iso | null;
}
```

and after the `Call` interface add:

```ts
export interface PatientDetail {
  patient: Patient;
  /** Newest first, all statuses. */
  appointments: Appointment[];
  calls: Pick<Call, "id" | "startedAt" | "endedAt" | "durationS" | "outcome" | "summary">[];
}
```

- [ ] **Step 6: Build and run the tests**

Run: `npm run build -w @muxaris/shared -w @muxaris/db && npx vitest run packages/shared`
Expected: PASS. Then `npm run typecheck` at root: expect failures only in `apps/api/src/routes/appointments.ts` (returns raw patients) if any; fix by leaving that route untouched (it does `db.select()` and never references the `Patient` DTO) and report what typecheck said.

- [ ] **Step 7: Commit**

```bash
git add packages/db packages/shared
git commit -m "feat(db,shared): patient email, notification retry columns, Phase 3 contracts"
```

---

### Task 2: Core patients, appointment outcomes, audited reveals, callback retention

**Files:**
- Modify: `packages/core/src/services/patients.ts`
- Modify: `packages/core/src/services/scheduling.ts` (add `setAppointmentOutcome`; `rescheduleAppointment` clears reminder stamps)
- Modify: `packages/core/src/services/calls.ts` (add `revealCallbackPhone`, `purgeExpiredCallbacks`; `finishCall` gets `patientId?`)
- Test: `packages/core/src/services/patients.test.ts` (new), `packages/core/src/services/calls-centre.test.ts` (add cases)

**Interfaces:**
- Consumes: Task 1 columns; `maskPhone` from shared; `makeTestClinic`/`openDb` from `./test-support.js`; `createClinicForUser`, `createDoctor`, `createService`, `setWorkingHours`, `bookAppointment` (existing).
- Produces:
  - `type PatientRow`, `type PatientView = Omit<PatientRow,"phone"> & { phoneMasked: string }`, `toPatientView(row)`
  - `listPatients(db, clinicId, { q?, limit, offset }) → { patients: PatientView[]; total: number }`
  - `getPatient(db, clinicId, patientId) → { patient: PatientView; appointments: Appointment[]; calls: CallRow[] }` (throws `not_found`)
  - `createPatient(db, clinicId, { phone, name?, email?, preferredLanguage?, dob?, notes? }) → PatientView` (throws `conflict` when the phone exists)
  - `updatePatient(db, clinicId, patientId, { name?, email?, preferredLanguage?, dob?, notes? }) → PatientView` (null clears; sets `updatedAt`)
  - `revealPatientPhone(db, { clinicId, patientId, actorUserId }) → { phone: string }` (audit `patient.phone.reveal`)
  - `revealCallbackPhone(db, { clinicId, callbackId, actorUserId }) → { phone: string }` (audit `callback.phone.reveal`; `conflict` if `purgedAt`)
  - `purgeExpiredCallbacks(db, { now?, retentionDays? = 90 }) → { purged: number }`
  - `setAppointmentOutcome(db, { clinicId, appointmentId, status: "completed" | "no_show", actorUserId, now? }) → Appointment` (audit `appointment.status.edit`)
  - `finishCall` input gains `patientId?: string` → sets `calls.patient_id`.

- [ ] **Step 1: Failing tests (patients)**

Create `packages/core/src/services/patients.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@muxaris/db";
import { CoreError } from "./errors.js";
import {
  createPatient,
  getPatient,
  listPatients,
  revealPatientPhone,
  updatePatient,
} from "./patients.js";
import { bookAppointment, createDoctor, createService, setAppointmentOutcome, setWorkingHours } from "./scheduling.js";
import { dbReachable, makeTestClinic, openDb, warnIfUnreachable } from "./test-support.js";

const reachable = await dbReachable();
warnIfUnreachable(reachable, "patients tests");
const { db, pool } = openDb();

(reachable ? describe : describe.skip)("patients", () => {
  let a: Awaited<ReturnType<typeof makeTestClinic>>;
  let b: Awaited<ReturnType<typeof makeTestClinic>>;
  beforeAll(async () => {
    a = await makeTestClinic(db, "pat-a");
    b = await makeTestClinic(db, "pat-b");
  });
  afterAll(async () => {
    await a.cleanup();
    await b.cleanup();
    await pool.end();
  });

  it("creates, lists (masked) and refuses a duplicate phone", async () => {
    const p = await createPatient(db, a.clinic.id, { phone: "+919876543210", name: "Ravi" });
    expect(p.phoneMasked).toBe("+91 •••• ••3210");
    expect("phone" in p).toBe(false);
    await expect(createPatient(db, a.clinic.id, { phone: "+919876543210" })).rejects.toMatchObject({
      code: "conflict",
    });
    const list = await listPatients(db, a.clinic.id, { q: "rav", limit: 10, offset: 0 });
    expect(list.total).toBe(1);
    expect(list.patients[0]?.id).toBe(p.id);
    expect((await listPatients(db, b.clinic.id, { limit: 10, offset: 0 })).total).toBe(0);
  });

  it("updates fields, clears with null and bumps updatedAt", async () => {
    const p = await createPatient(db, a.clinic.id, { phone: "+919876543211", notes: "x" });
    const u = await updatePatient(db, a.clinic.id, p.id, { email: "r@example.test", notes: null });
    expect(u.email).toBe("r@example.test");
    expect(u.notes).toBeNull();
    expect(u.updatedAt.getTime()).toBeGreaterThanOrEqual(p.updatedAt.getTime());
    await expect(updatePatient(db, b.clinic.id, p.id, { name: "x" })).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("reveal returns the raw phone and writes an audit row without the number", async () => {
    const p = await createPatient(db, a.clinic.id, { phone: "+919876543212" });
    const r = await revealPatientPhone(db, {
      clinicId: a.clinic.id,
      patientId: p.id,
      actorUserId: a.user.id,
    });
    expect(r.phone).toBe("+919876543212");
    const [aud] = await db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, p.id));
    expect(aud?.action).toBe("patient.phone.reveal");
    expect(JSON.stringify(aud?.data ?? {})).not.toContain("3212");
    await expect(
      revealPatientPhone(db, { clinicId: b.clinic.id, patientId: p.id, actorUserId: b.user.id }),
    ).rejects.toBeInstanceOf(CoreError);
  });

  it("getPatient returns visit history newest first and marks no-show only after start", async () => {
    const doc = await createDoctor(db, a.clinic.id, { name: "Dr Rao" });
    await setWorkingHours(db, a.clinic.id, doc.id, [
      ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: "09:00", end: "18:00" })),
    ]);
    const svc = await createService(db, a.clinic.id, { name: "Cleaning", durationMin: 30 });
    const past = new Date(Date.now() - 3 * 86_400_000);
    past.setUTCHours(5, 30, 0, 0); // 11:00 IST
    const apt = await bookAppointment(db, {
      clinicId: a.clinic.id,
      patient: { phone: "+919876543213", name: "Meena" },
      doctorId: doc.id,
      serviceId: svc.id,
      startsAt: past,
      source: "dashboard",
      allowOutsideRules: true,
    });
    const detail = await getPatient(db, a.clinic.id, apt.patientId);
    expect(detail.appointments[0]?.id).toBe(apt.id);
    expect(detail.patient.phoneMasked.endsWith("3213")).toBe(true);
    const done = await setAppointmentOutcome(db, {
      clinicId: a.clinic.id,
      appointmentId: apt.id,
      status: "no_show",
      actorUserId: a.user.id,
    });
    expect(done.status).toBe("no_show");
    await expect(
      setAppointmentOutcome(db, {
        clinicId: a.clinic.id,
        appointmentId: apt.id,
        status: "completed",
        actorUserId: a.user.id,
      }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("refuses to mark a future appointment", async () => {
    const doc = await createDoctor(db, a.clinic.id, { name: "Dr Future" });
    const svc = await createService(db, a.clinic.id, { name: "Check", durationMin: 30 });
    const future = new Date(Date.now() + 5 * 86_400_000);
    future.setUTCHours(5, 30, 0, 0);
    const apt = await bookAppointment(db, {
      clinicId: a.clinic.id,
      patient: { phone: "+919876543214" },
      doctorId: doc.id,
      serviceId: svc.id,
      startsAt: future,
      source: "dashboard",
      allowOutsideRules: true,
    });
    await expect(
      setAppointmentOutcome(db, {
        clinicId: a.clinic.id,
        appointmentId: apt.id,
        status: "completed",
        actorUserId: a.user.id,
      }),
    ).rejects.toMatchObject({ code: "conflict" });
  });
});
```

If `createDoctor`/`setWorkingHours`/`createService` input shapes differ from the calls above, read `scheduling.ts:42-80,139-160` and adapt the test to the real `DoctorInput`/`WorkingHoursInput`/`ServiceInput` (the past-date booking uses `allowOutsideRules: true`, so hours only need to exist).

Add to `packages/core/src/services/calls-centre.test.ts` (inside the existing Postgres-gated describe, using its clinic `a` and user):

```ts
  it("revealCallbackPhone audits and refuses after the 90-day purge", async () => {
    const cb = await createCallback(db, {
      clinicId: a.clinic.id,
      phone: "+919876500001",
      reason: "call back",
    });
    const r = await revealCallbackPhone(db, {
      clinicId: a.clinic.id,
      callbackId: cb.id,
      actorUserId: a.user.id,
    });
    expect(r.phone).toBe("+919876500001");
    await updateCallback(db, { clinicId: a.clinic.id, callbackId: cb.id, status: "done" });
    const later = new Date(Date.now() + 91 * 86_400_000);
    expect((await purgeExpiredCallbacks(db, { now: later })).purged).toBeGreaterThanOrEqual(1);
    const [row] = await db.select().from(schema.callbacks).where(eq(schema.callbacks.id, cb.id));
    expect(row?.phone).toBe("+91 •••• ••0001");
    expect(row?.purgedAt).not.toBeNull();
    expect(row?.reason).toBe("purged");
    await expect(
      revealCallbackPhone(db, { clinicId: a.clinic.id, callbackId: cb.id, actorUserId: a.user.id }),
    ).rejects.toMatchObject({ code: "conflict" });
    // open callbacks are never purged
    const open = await createCallback(db, { clinicId: a.clinic.id, phone: "+919876500002", reason: "x" });
    await purgeExpiredCallbacks(db, { now: later });
    const [o] = await db.select().from(schema.callbacks).where(eq(schema.callbacks.id, open.id));
    expect(o?.purgedAt).toBeNull();
  });

  it("finishCall links the patient when given", async () => {
    const p = await createPatient(db, a.clinic.id, { phone: "+919876500003" });
    const call = await createCall(db, { clinicId: a.clinic.id, channel: "browser" });
    await finishCall(db, {
      callId: call.id,
      clinicId: a.clinic.id,
      status: "completed",
      durationS: 10,
      patientId: p.id,
    });
    const { call: got } = await getCall(db, a.clinic.id, call.id);
    expect(got.patientId).toBe(p.id);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/core/src/services/patients.test.ts packages/core/src/services/calls-centre.test.ts`
Expected: FAIL on missing exports.

- [ ] **Step 3: Implement patients.ts**

Append to `packages/core/src/services/patients.ts` (add `desc`, `ilike`, `or`, `sql`, `count` to the drizzle import; import `maskPhone` from `@muxaris/shared`; import `calls`, `auditLog` from schema):

```ts
export type PatientRow = typeof patients.$inferSelect;
/** Patient as exposed by core reads: the raw phone never leaves this module. */
export type PatientView = Omit<PatientRow, "phone"> & { phoneMasked: string };
export function toPatientView(row: PatientRow): PatientView {
  const { phone, ...rest } = row;
  return { ...rest, phoneMasked: maskPhone(phone) };
}

export interface PatientPatch {
  name?: string | null;
  email?: string | null;
  preferredLanguage?: string;
  dob?: string | null;
  notes?: string | null;
}

export async function listPatients(
  db: Db,
  clinicId: string,
  opts: { q?: string; limit: number; offset: number },
): Promise<{ patients: PatientView[]; total: number }> {
  const like = opts.q ? `%${opts.q.replace(/[\\%_]/g, "\\$&")}%` : null;
  const where = and(
    eq(patients.clinicId, clinicId),
    like ? or(ilike(patients.name, like), ilike(patients.phone, like), ilike(patients.email, like)) : undefined,
  );
  const [rows, [tot]] = await Promise.all([
    db
      .select()
      .from(patients)
      .where(where)
      .orderBy(desc(patients.createdAt), desc(patients.id))
      .limit(opts.limit)
      .offset(opts.offset),
    db.select({ n: count() }).from(patients).where(where),
  ]);
  return { patients: rows.map(toPatientView), total: Number(tot?.n ?? 0) };
}

async function loadPatient(db: DbLike, clinicId: string, patientId: string): Promise<PatientRow> {
  const [row] = await db
    .select()
    .from(patients)
    .where(and(eq(patients.id, patientId), eq(patients.clinicId, clinicId)));
  if (!row) throw new CoreError("not_found", "patient not found");
  return row;
}

export async function getPatient(db: Db, clinicId: string, patientId: string) {
  const row = await loadPatient(db, clinicId, patientId);
  const [apts, callRows] = await Promise.all([
    db
      .select()
      .from(appointments)
      .where(and(eq(appointments.clinicId, clinicId), eq(appointments.patientId, patientId)))
      .orderBy(desc(appointments.startsAt))
      .limit(100),
    db
      .select()
      .from(calls)
      .where(and(eq(calls.clinicId, clinicId), eq(calls.patientId, patientId)))
      .orderBy(desc(calls.startedAt))
      .limit(50),
  ]);
  return { patient: toPatientView(row), appointments: apts, calls: callRows };
}

export async function createPatient(
  db: Db,
  clinicId: string,
  input: PatientInput & Omit<PatientPatch, "name" | "preferredLanguage">,
): Promise<PatientView> {
  const phone = input.phone.trim();
  if (!phone) throw new CoreError("validation", "patient phone is required");
  const existing = await findPatientByPhone(db, clinicId, phone);
  if (existing) throw new CoreError("conflict", "a patient with this phone already exists");
  const [row] = await db
    .insert(patients)
    .values({
      id: newId("pat"),
      clinicId,
      phone,
      name: input.name?.trim() || null,
      email: input.email?.trim() || null,
      dob: input.dob ?? null,
      notes: input.notes ?? null,
      ...(input.preferredLanguage ? { preferredLanguage: input.preferredLanguage } : {}),
    })
    .returning();
  return toPatientView(row!);
}

export async function updatePatient(
  db: Db,
  clinicId: string,
  patientId: string,
  patch: PatientPatch,
): Promise<PatientView> {
  await loadPatient(db, clinicId, patientId);
  const [row] = await db
    .update(patients)
    .set({
      ...(patch.name !== undefined ? { name: patch.name?.trim() || null } : {}),
      ...(patch.email !== undefined ? { email: patch.email?.trim() || null } : {}),
      ...(patch.preferredLanguage ? { preferredLanguage: patch.preferredLanguage } : {}),
      ...(patch.dob !== undefined ? { dob: patch.dob } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(patients.id, patientId), eq(patients.clinicId, clinicId)))
    .returning();
  return toPatientView(row!);
}

/** The only path that returns a raw patient phone. Every call is audited (no number in the row). */
export async function revealPatientPhone(
  db: Db,
  input: { clinicId: string; patientId: string; actorUserId: string },
): Promise<{ phone: string }> {
  const row = await loadPatient(db, input.clinicId, input.patientId);
  await db.insert(auditLog).values({
    id: newId("aud"),
    clinicId: input.clinicId,
    actorId: input.actorUserId,
    action: "patient.phone.reveal",
    entity: "patient",
    entityId: input.patientId,
    data: {},
  });
  return { phone: row.phone };
}
```

Export `PatientView` and friends via the existing `export * from "./services/patients.js"` in `packages/core/src/index.ts` (already there).

- [ ] **Step 4: Implement scheduling.ts and calls.ts additions**

In `scheduling.ts`, in `rescheduleAppointment` change the `.set({...})` to:

```ts
      .set({
        startsAt: input.newStartsAt,
        endsAt,
        status: "rescheduled",
        reminder24hSentAt: null,
        reminder2hSentAt: null,
      })
```

Add after `cancelAppointment` (import `auditLog` from schema):

```ts
/** Staff marks a past appointment completed or no-show. Audited; never for future or finalised rows. */
export async function setAppointmentOutcome(
  db: Db,
  input: {
    clinicId: string;
    appointmentId: string;
    status: "completed" | "no_show";
    actorUserId: string;
    now?: Date;
  },
): Promise<Appointment> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [apt] = await tx
      .select()
      .from(appointments)
      .where(
        and(eq(appointments.id, input.appointmentId), eq(appointments.clinicId, input.clinicId)),
      )
      .for("update");
    if (!apt) throw new CoreError("not_found", "appointment not found");
    if (!ACTIVE.includes(apt.status))
      throw new CoreError("conflict", `cannot change a ${apt.status} appointment`);
    if (apt.startsAt.getTime() > now.getTime())
      throw new CoreError("conflict", "appointment has not started yet");
    const [row] = await tx
      .update(appointments)
      .set({ status: input.status })
      .where(eq(appointments.id, apt.id))
      .returning();
    await tx.insert(auditLog).values({
      id: newId("aud"),
      clinicId: input.clinicId,
      actorId: input.actorUserId,
      action: "appointment.status.edit",
      entity: "appointment",
      entityId: apt.id,
      data: { from: apt.status, to: input.status },
    });
    return row!;
  });
}
```

In `calls.ts`:

`finishCall` input gains `patientId?: string`; in its `.set({...})` add `...(input.patientId ? { patientId: input.patientId } : {})`.

Add:

```ts
/** The only path that returns a raw callback phone. Audited; refused once the row is purged. */
export async function revealCallbackPhone(
  db: Db,
  input: { clinicId: string; callbackId: string; actorUserId: string },
): Promise<{ phone: string }> {
  const [row] = await db
    .select()
    .from(callbacks)
    .where(and(eq(callbacks.id, input.callbackId), eq(callbacks.clinicId, input.clinicId)));
  if (!row) throw new CoreError("not_found", "callback not found");
  if (row.purgedAt) throw new CoreError("conflict", "callback contact details were purged");
  await db.insert(auditLog).values({
    id: newId("aud"),
    clinicId: input.clinicId,
    actorId: input.actorUserId,
    action: "callback.phone.reveal",
    entity: "callback",
    entityId: input.callbackId,
    data: {},
  });
  return { phone: row.phone };
}

/** Done callbacks older than the retention window lose their contact details (phone masked in place). */
export async function purgeExpiredCallbacks(
  db: Db,
  opts: { now?: Date; retentionDays?: number } = {},
): Promise<{ purged: number }> {
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - (opts.retentionDays ?? 90) * 86_400_000);
  const due = await db
    .select({ id: callbacks.id, phone: callbacks.phone })
    .from(callbacks)
    .where(
      and(eq(callbacks.status, "done"), lt(callbacks.doneAt, cutoff), isNull(callbacks.purgedAt)),
    )
    .limit(500);
  let purged = 0;
  for (const row of due) {
    await db
      .update(callbacks)
      .set({ phone: maskPhone(row.phone), reason: "purged", note: null, purgedAt: now })
      .where(and(eq(callbacks.id, row.id), isNull(callbacks.purgedAt)));
    purged++;
  }
  return { purged };
}
```

(`lt`, `isNull` from drizzle-orm; `maskPhone` is already imported in calls.ts for `toCallbackView`.)

- [ ] **Step 5: Run tests, gate, commit**

Run: `npm run build -w @muxaris/core && npx vitest run packages/core` then `npm run typecheck && npm run lint && npx prettier --check .`
Expected: PASS.

```bash
git add packages/core
git commit -m "feat(core): patient CRUD and views, audited phone reveals, appointment outcomes, callback purge"
```

---

### Task 3: Notification templates in five languages

**Files:**
- Create: `packages/core/src/notifications/templates.ts`
- Test: `packages/core/src/notifications/templates.test.ts`
- Modify: `packages/core/src/index.ts` (export)

**Interfaces:**
- Consumes: `NotificationKind`, `LanguageCode`, `LANGUAGE_CODES` from `@muxaris/shared`.
- Produces:
  - `interface TemplateVars { patientName: string | null; clinicName: string; doctorName: string; serviceName: string; when: string; clinicPhone: string | null }`
  - `renderNotification(kind: NotificationKind, lang: LanguageCode, vars: TemplateVars) → { subject: string; body: string }`
  - `formatWhen(at: Date, tz: string, lang: LanguageCode) → string`
  - `templateLanguage(code: string | null | undefined) → LanguageCode` (falls back to `en-IN`)

- [ ] **Step 1: Failing test**

Create `packages/core/src/notifications/templates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { LANGUAGE_CODES, NOTIFICATION_KINDS } from "@muxaris/shared";
import { formatWhen, renderNotification, templateLanguage, type TemplateVars } from "./templates.js";

const vars: TemplateVars = {
  patientName: "Ravi",
  clinicName: "Sunrise Dental",
  doctorName: "Dr. Rao",
  serviceName: "Cleaning",
  when: "Mon, 6 Oct 2026, 11:00 am",
  clinicPhone: "+918040001234",
};

describe("notification templates", () => {
  it("renders every kind in every language with the variables filled", () => {
    for (const lang of LANGUAGE_CODES) {
      for (const kind of NOTIFICATION_KINDS) {
        const r = renderNotification(kind, lang, vars);
        expect(r.subject.length, `${lang}/${kind} subject`).toBeGreaterThan(5);
        expect(r.body, `${lang}/${kind} body`).toContain("Sunrise Dental");
        expect(r.body).toContain(vars.when);
        expect(r.body).not.toMatch(/\{[a-z]+\}/);
        expect(r.subject).not.toMatch(/\{[a-z]+\}/);
        // subjects never carry the patient's name
        expect(r.subject).not.toContain("Ravi");
      }
    }
  });
  it("greets by name when known and omits it otherwise", () => {
    expect(renderNotification("appointment_confirmed", "en-IN", vars).body).toMatch(/^Namaste Ravi\./);
    expect(
      renderNotification("appointment_confirmed", "en-IN", { ...vars, patientName: null }).body,
    ).toMatch(/^Namaste\./);
  });
  it("includes the clinic phone only when present", () => {
    expect(renderNotification("appointment_confirmed", "hi-IN", vars).body).toContain("+918040001234");
    expect(
      renderNotification("appointment_confirmed", "hi-IN", { ...vars, clinicPhone: null }).body,
    ).not.toContain("+91");
  });
  it("formats times in the clinic zone and language", () => {
    const at = new Date("2026-10-06T05:30:00Z");
    expect(formatWhen(at, "Asia/Kolkata", "en-IN")).toMatch(/6 Oct 2026/);
    expect(formatWhen(at, "Asia/Kolkata", "en-IN")).toMatch(/11:00/);
    expect(formatWhen(at, "Asia/Kolkata", "hi-IN")).toMatch(/2026/);
  });
  it("falls back to English for unknown codes", () => {
    expect(templateLanguage("fr-FR")).toBe("en-IN");
    expect(templateLanguage("ta-IN")).toBe("ta-IN");
    expect(templateLanguage(null)).toBe("en-IN");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/core/src/notifications/templates.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

Create `packages/core/src/notifications/templates.ts` with the strings exactly as below:

```ts
import {
  LANGUAGE_CODES,
  type LanguageCode,
  type NotificationKind,
} from "@muxaris/shared";

export interface TemplateVars {
  patientName: string | null;
  clinicName: string;
  doctorName: string;
  serviceName: string;
  /** Already formatted in the clinic's zone and the recipient's language (formatWhen). */
  when: string;
  clinicPhone: string | null;
}

interface LanguagePack {
  /** greeting(name) → first sentence, always ends with a full stop. */
  greeting: (name: string | null) => string;
  /** Line telling the patient how to change the booking. */
  change: (phone: string | null) => string;
  rebook: string;
  kinds: Record<NotificationKind, { subject: string; body: string }>;
}

// Placeholders: {clinic} {doctor} {service} {when}. Subjects never include the patient's name.
const PACKS: Record<LanguageCode, LanguagePack> = {
  "en-IN": {
    greeting: (n) => (n ? `Namaste ${n}.` : "Namaste."),
    change: (p) => (p ? `To change it, call ${p}.` : "To change it, call the clinic."),
    rebook: "Call the clinic to book again.",
    kinds: {
      appointment_confirmed: {
        subject: "Appointment confirmed at {clinic}",
        body: "Your {service} with {doctor} at {clinic} is booked for {when}.",
      },
      appointment_rescheduled: {
        subject: "Appointment moved: {clinic}",
        body: "Your {service} with {doctor} at {clinic} has been moved to {when}.",
      },
      appointment_cancelled: {
        subject: "Appointment cancelled: {clinic}",
        body: "Your {service} with {doctor} at {clinic} on {when} has been cancelled.",
      },
      reminder_24h: {
        subject: "Reminder: your appointment at {clinic}",
        body: "A reminder that your {service} with {doctor} at {clinic} is on {when}.",
      },
      reminder_2h: {
        subject: "Reminder: appointment today at {clinic}",
        body: "Your {service} with {doctor} at {clinic} is in about two hours, at {when}.",
      },
    },
  },
  "hi-IN": {
    greeting: (n) => (n ? `नमस्ते ${n}।` : "नमस्ते।"),
    change: (p) => (p ? `बदलाव के लिए ${p} पर कॉल करें।` : "बदलाव के लिए क्लिनिक को कॉल करें।"),
    rebook: "दोबारा बुक करने के लिए क्लिनिक को कॉल करें।",
    kinds: {
      appointment_confirmed: {
        subject: "{clinic} में अपॉइंटमेंट पक्की हुई",
        body: "{clinic} में {doctor} के साथ आपकी {service} अपॉइंटमेंट {when} के लिए बुक हो गई है।",
      },
      appointment_rescheduled: {
        subject: "{clinic}: अपॉइंटमेंट का समय बदला",
        body: "{clinic} में {doctor} के साथ आपकी {service} अपॉइंटमेंट अब {when} को है।",
      },
      appointment_cancelled: {
        subject: "{clinic}: अपॉइंटमेंट रद्द",
        body: "{clinic} में {doctor} के साथ {when} की आपकी {service} अपॉइंटमेंट रद्द कर दी गई है।",
      },
      reminder_24h: {
        subject: "याद दिलाना: {clinic} में अपॉइंटमेंट",
        body: "{clinic} में {doctor} के साथ आपकी {service} अपॉइंटमेंट {when} को है।",
      },
      reminder_2h: {
        subject: "याद दिलाना: आज {clinic} में अपॉइंटमेंट",
        body: "{clinic} में {doctor} के साथ आपकी {service} अपॉइंटमेंट लगभग दो घंटे में, {when} को है।",
      },
    },
  },
  "kn-IN": {
    greeting: (n) => (n ? `ನಮಸ್ಕಾರ ${n}.` : "ನಮಸ್ಕಾರ."),
    change: (p) => (p ? `ಬದಲಾವಣೆಗೆ ${p} ಗೆ ಕರೆ ಮಾಡಿ.` : "ಬದಲಾವಣೆಗೆ ಕ್ಲಿನಿಕ್‌ಗೆ ಕರೆ ಮಾಡಿ."),
    rebook: "ಮತ್ತೆ ಬುಕ್ ಮಾಡಲು ಕ್ಲಿನಿಕ್‌ಗೆ ಕರೆ ಮಾಡಿ.",
    kinds: {
      appointment_confirmed: {
        subject: "{clinic} ನಲ್ಲಿ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಖಚಿತವಾಗಿದೆ",
        body: "{clinic} ನಲ್ಲಿ {doctor} ಅವರೊಂದಿಗೆ ನಿಮ್ಮ {service} ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ {when} ಕ್ಕೆ ಬುಕ್ ಆಗಿದೆ.",
      },
      appointment_rescheduled: {
        subject: "{clinic}: ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಸಮಯ ಬದಲಾಗಿದೆ",
        body: "{clinic} ನಲ್ಲಿ {doctor} ಅವರೊಂದಿಗೆ ನಿಮ್ಮ {service} ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಈಗ {when} ಕ್ಕೆ ಇದೆ.",
      },
      appointment_cancelled: {
        subject: "{clinic}: ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ರದ್ದಾಗಿದೆ",
        body: "{clinic} ನಲ್ಲಿ {doctor} ಅವರೊಂದಿಗೆ {when} ರ ನಿಮ್ಮ {service} ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ರದ್ದಾಗಿದೆ.",
      },
      reminder_24h: {
        subject: "ಜ್ಞಾಪನೆ: {clinic} ನಲ್ಲಿ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್",
        body: "{clinic} ನಲ್ಲಿ {doctor} ಅವರೊಂದಿಗೆ ನಿಮ್ಮ {service} ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ {when} ಕ್ಕೆ ಇದೆ.",
      },
      reminder_2h: {
        subject: "ಜ್ಞಾಪನೆ: ಇಂದು {clinic} ನಲ್ಲಿ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್",
        body: "{clinic} ನಲ್ಲಿ {doctor} ಅವರೊಂದಿಗೆ ನಿಮ್ಮ {service} ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಸುಮಾರು ಎರಡು ಗಂಟೆಗಳಲ್ಲಿ, {when} ಕ್ಕೆ ಇದೆ.",
      },
    },
  },
  "ta-IN": {
    greeting: (n) => (n ? `வணக்கம் ${n}.` : "வணக்கம்."),
    change: (p) =>
      p ? `மாற்ற வேண்டுமெனில் ${p} ஐ அழைக்கவும்.` : "மாற்ற வேண்டுமெனில் கிளினிக்கை அழைக்கவும்.",
    rebook: "மீண்டும் பதிவு செய்ய கிளினிக்கை அழைக்கவும்.",
    kinds: {
      appointment_confirmed: {
        subject: "{clinic} இல் அப்பாயிண்ட்மெண்ட் உறுதி",
        body: "{clinic} இல் {doctor} உடன் உங்கள் {service} அப்பாயிண்ட்மெண்ட் {when} அன்று பதிவு செய்யப்பட்டுள்ளது.",
      },
      appointment_rescheduled: {
        subject: "{clinic}: அப்பாயிண்ட்மெண்ட் நேரம் மாற்றம்",
        body: "{clinic} இல் {doctor} உடன் உங்கள் {service} அப்பாயிண்ட்மெண்ட் இப்போது {when} அன்று உள்ளது.",
      },
      appointment_cancelled: {
        subject: "{clinic}: அப்பாயிண்ட்மெண்ட் ரத்து",
        body: "{clinic} இல் {doctor} உடன் {when} அன்று இருந்த உங்கள் {service} அப்பாயிண்ட்மெண்ட் ரத்து செய்யப்பட்டது.",
      },
      reminder_24h: {
        subject: "நினைவூட்டல்: {clinic} இல் அப்பாயிண்ட்மெண்ட்",
        body: "{clinic} இல் {doctor} உடன் உங்கள் {service} அப்பாயிண்ட்மெண்ட் {when} அன்று உள்ளது.",
      },
      reminder_2h: {
        subject: "நினைவூட்டல்: இன்று {clinic} இல் அப்பாயிண்ட்மெண்ட்",
        body: "{clinic} இல் {doctor} உடன் உங்கள் {service} அப்பாயிண்ட்மெண்ட் சுமார் இரண்டு மணி நேரத்தில், {when} அன்று உள்ளது.",
      },
    },
  },
  "te-IN": {
    greeting: (n) => (n ? `నమస్కారం ${n}.` : "నమస్కారం."),
    change: (p) => (p ? `మార్చాలంటే ${p} కి కాల్ చేయండి.` : "మార్చాలంటే క్లినిక్‌కు కాల్ చేయండి."),
    rebook: "మళ్లీ బుక్ చేయడానికి క్లినిక్‌కు కాల్ చేయండి.",
    kinds: {
      appointment_confirmed: {
        subject: "{clinic} లో అపాయింట్‌మెంట్ ఖరారు",
        body: "{clinic} లో {doctor} తో మీ {service} అపాయింట్‌మెంట్ {when} కి బుక్ అయింది.",
      },
      appointment_rescheduled: {
        subject: "{clinic}: అపాయింట్‌మెంట్ సమయం మారింది",
        body: "{clinic} లో {doctor} తో మీ {service} అపాయింట్‌మెంట్ ఇప్పుడు {when} కి ఉంది.",
      },
      appointment_cancelled: {
        subject: "{clinic}: అపాయింట్‌మెంట్ రద్దు",
        body: "{clinic} లో {doctor} తో {when} కి ఉన్న మీ {service} అపాయింట్‌మెంట్ రద్దు చేయబడింది.",
      },
      reminder_24h: {
        subject: "గుర్తు చేయడం: {clinic} లో అపాయింట్‌మెంట్",
        body: "{clinic} లో {doctor} తో మీ {service} అపాయింట్‌మెంట్ {when} కి ఉంది.",
      },
      reminder_2h: {
        subject: "గుర్తు చేయడం: ఈరోజు {clinic} లో అపాయింట్‌మెంట్",
        body: "{clinic} లో {doctor} తో మీ {service} అపాయింట్‌మెంట్ సుమారు రెండు గంటల్లో, {when} కి ఉంది.",
      },
    },
  },
};

function fill(s: string, v: TemplateVars): string {
  return s
    .replaceAll("{clinic}", v.clinicName)
    .replaceAll("{doctor}", v.doctorName)
    .replaceAll("{service}", v.serviceName)
    .replaceAll("{when}", v.when);
}

export function templateLanguage(code: string | null | undefined): LanguageCode {
  return (LANGUAGE_CODES as readonly string[]).includes(code ?? "")
    ? (code as LanguageCode)
    : "en-IN";
}

export function renderNotification(
  kind: NotificationKind,
  lang: LanguageCode,
  vars: TemplateVars,
): { subject: string; body: string } {
  const pack = PACKS[lang];
  const t = pack.kinds[kind];
  const tail = kind === "appointment_cancelled" ? pack.rebook : pack.change(vars.clinicPhone);
  return {
    subject: fill(t.subject, vars),
    body: `${pack.greeting(vars.patientName)} ${fill(t.body, vars)} ${tail}`,
  };
}

export function formatWhen(at: Date, tz: string, lang: LanguageCode): string {
  return new Intl.DateTimeFormat(lang, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  }).format(at);
}
```

Add `export * from "./notifications/templates.js";` to `packages/core/src/index.ts`.

- [ ] **Step 4: Run tests, gate, commit**

Run: `npm run build -w @muxaris/core && npx vitest run packages/core/src/notifications && npx prettier --check packages/core`
Expected: PASS. If prettier reflows the long body strings, run `npx prettier --write packages/core/src/notifications` (strings themselves must stay byte-identical).

```bash
git add packages/core/src/notifications packages/core/src/index.ts
git commit -m "feat(core): appointment notification templates in five languages"
```

---

### Task 4: Notification outbox, reminder sweep, booking hooks

**Files:**
- Create: `packages/core/src/notifications/outbox.ts`, `packages/core/src/notifications/reminders.ts`
- Modify: `packages/core/src/services/scheduling.ts` (`bookAppointment`, `rescheduleAppointment`, `cancelAppointment` gain `notify?: ChannelFlags`)
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/notifications/outbox.test.ts`

**Interfaces:**
- Consumes: Task 1 columns and `ChannelFlags`, `NotificationKind`, `SkipReason`, `clinicNotificationSettings`, `maskEmail`, `maskPhone`; Task 3 `renderNotification`, `formatWhen`, `templateLanguage`.
- Produces:
  - `type NotificationRow`, `type NotificationView = Omit<NotificationRow,"to"> & { toMasked: string }`, `toNotificationView(row)`
  - `queueAppointmentNotification(tx: DbLike, { clinicId, appointmentId, kind, channels, now? }) → Promise<NotificationRow | null>` (null when the clinic turned the kind off)
  - `claimQueuedNotifications(db, { limit?, now?, retryAfterMs? }) → Promise<NotificationRow[]>`
  - `markNotificationSent(db, id, { providerId, now? })`, `markNotificationFailed(db, id, { error, final })`, `markNotificationSkipped(db, id, { reason: SkipReason })`
  - `listNotifications(db, clinicId, { status?, appointmentId?, patientId?, limit, offset }) → { notifications: NotificationView[]; total }`
  - `retryNotification(db, { clinicId, notificationId, channels }) → NotificationView`
  - `enqueueDueReminders(db, { now?, channels }) → { queued24h: number; queued2h: number }`
  - `bookAppointment` / `rescheduleAppointment` / `cancelAppointment` accept `notify?: ChannelFlags`; when present they queue `appointment_confirmed` / `appointment_rescheduled` / `appointment_cancelled` inside their transaction.

- [ ] **Step 1: Failing tests**

Create `packages/core/src/notifications/outbox.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@muxaris/db";
import {
  claimQueuedNotifications,
  enqueueDueReminders,
  listNotifications,
  markNotificationFailed,
  markNotificationSent,
  retryNotification,
} from "./index.js";
import { createPatient, updatePatient } from "../services/patients.js";
import {
  bookAppointment,
  cancelAppointment,
  createDoctor,
  createService,
  rescheduleAppointment,
  setWorkingHours,
} from "../services/scheduling.js";
import { dbReachable, makeTestClinic, openDb, warnIfUnreachable } from "../services/test-support.js";

const reachable = await dbReachable();
warnIfUnreachable(reachable, "outbox tests");
const { db, pool } = openDb();
const OFF = { sms: false, whatsapp: false };
const H = 3600_000;

(reachable ? describe : describe.skip)("notification outbox", () => {
  let a: Awaited<ReturnType<typeof makeTestClinic>>;
  let doctorId: string;
  let serviceId: string;
  beforeAll(async () => {
    a = await makeTestClinic(db, "ntf");
    const doc = await createDoctor(db, a.clinic.id, { name: "Dr Rao" });
    await setWorkingHours(
      db,
      a.clinic.id,
      doc.id,
      [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start: "00:00", end: "23:59" })),
    );
    doctorId = doc.id;
    serviceId = (await createService(db, a.clinic.id, { name: "Cleaning", durationMin: 30 })).id;
  });
  afterAll(async () => {
    await a.cleanup();
    await pool.end();
  });

  const book = (phone: string, startsAt: Date, name = "Ravi") =>
    bookAppointment(db, {
      clinicId: a.clinic.id,
      patient: { phone, name },
      doctorId,
      serviceId,
      startsAt,
      source: "dashboard",
      allowOutsideRules: true,
      notify: OFF,
    });

  it("books with a skipped row when the patient has no email, and a queued email once they do", async () => {
    const t = new Date(Date.now() + 3 * 86_400_000);
    const apt = await book("+919876600001", t);
    const l1 = await listNotifications(db, a.clinic.id, { appointmentId: apt.id, limit: 10, offset: 0 });
    expect(l1.total).toBe(1);
    expect(l1.notifications[0]).toMatchObject({ status: "skipped", error: "no_contact", template: "appointment_confirmed" });
    expect("to" in (l1.notifications[0] ?? {})).toBe(false);

    await updatePatient(db, a.clinic.id, apt.patientId, { email: "ravi@example.test" });
    const retried = await retryNotification(db, {
      clinicId: a.clinic.id,
      notificationId: l1.notifications[0]!.id,
      channels: OFF,
    });
    expect(retried.status).toBe("queued");
    expect(retried.toMasked).toBe("r•••@example.test");
    expect(retried.payload.subject).toContain(a.clinic.name);
    expect(retried.payload.body).toContain("Ravi");
  });

  it("reschedule and cancel queue their own kinds and reschedule re-arms reminders", async () => {
    const t = new Date(Date.now() + 4 * 86_400_000);
    const apt = await book("+919876600002", t);
    await db
      .update(schema.appointments)
      .set({ reminder24hSentAt: new Date(), reminder2hSentAt: new Date() })
      .where(eq(schema.appointments.id, apt.id));
    const moved = await rescheduleAppointment(db, {
      clinicId: a.clinic.id,
      appointmentId: apt.id,
      newStartsAt: new Date(t.getTime() + H),
      allowOutsideRules: true,
      notify: OFF,
    });
    expect(moved.reminder24hSentAt).toBeNull();
    expect(moved.reminder2hSentAt).toBeNull();
    await cancelAppointment(db, { clinicId: a.clinic.id, appointmentId: apt.id, notify: OFF });
    const l = await listNotifications(db, a.clinic.id, { appointmentId: apt.id, limit: 10, offset: 0 });
    expect(l.notifications.map((n) => n.template).sort()).toEqual([
      "appointment_cancelled",
      "appointment_confirmed",
      "appointment_rescheduled",
    ]);
  });

  it("honours the clinic's confirmations switch", async () => {
    await db
      .update(schema.clinics)
      .set({ settings: { notifications: { confirmations: false } } })
      .where(eq(schema.clinics.id, a.clinic.id));
    const apt = await book("+919876600003", new Date(Date.now() + 5 * 86_400_000));
    const l = await listNotifications(db, a.clinic.id, { appointmentId: apt.id, limit: 10, offset: 0 });
    expect(l.total).toBe(0);
    await db.update(schema.clinics).set({ settings: {} }).where(eq(schema.clinics.id, a.clinic.id));
  });

  it("claims queued rows once, re-claims after the retry delay, and finalises after max attempts", async () => {
    const p = await createPatient(db, a.clinic.id, { phone: "+919876600004", email: "c@example.test" });
    const apt = await bookAppointment(db, {
      clinicId: a.clinic.id,
      patient: { phone: "+919876600004" },
      doctorId,
      serviceId,
      startsAt: new Date(Date.now() + 6 * 86_400_000),
      source: "dashboard",
      allowOutsideRules: true,
      notify: OFF,
    });
    expect(apt.patientId).toBe(p.id);
    const now = new Date();
    const first = await claimQueuedNotifications(db, { now, limit: 50 });
    const mine = first.filter((n) => n.appointmentId === apt.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.attempts).toBe(1);
    const again = await claimQueuedNotifications(db, { now, limit: 50 });
    expect(again.some((n) => n.appointmentId === apt.id)).toBe(false);
    const later = new Date(now.getTime() + 6 * 60_000);
    const third = await claimQueuedNotifications(db, { now: later, limit: 50 });
    expect(third.some((n) => n.appointmentId === apt.id)).toBe(true);
    await markNotificationFailed(db, mine[0]!.id, { error: "MessageRejected", final: false });
    let [row] = await db.select().from(schema.notifications).where(eq(schema.notifications.id, mine[0]!.id));
    expect(row?.status).toBe("queued");
    expect(row?.error).toBe("MessageRejected");
    await markNotificationFailed(db, mine[0]!.id, { error: "MessageRejected", final: true });
    [row] = await db.select().from(schema.notifications).where(eq(schema.notifications.id, mine[0]!.id));
    expect(row?.status).toBe("failed");
    await markNotificationSent(db, mine[0]!.id, { providerId: "x" });
    [row] = await db.select().from(schema.notifications).where(eq(schema.notifications.id, mine[0]!.id));
    expect(row?.status).toBe("sent");
    expect(row?.sentAt).not.toBeNull();
  });

  it("queues 24h and 2h reminders in their windows, once, and not for fresh bookings", async () => {
    const now = new Date();
    const in23h = await book("+919876600005", new Date(now.getTime() + 23 * H));
    const in90m = await book("+919876600006", new Date(now.getTime() + 1.5 * H));
    const in10h = await book("+919876600007", new Date(now.getTime() + 10 * H));
    // the 90-minute booking was "created" 40 minutes ago so it is eligible
    await db
      .update(schema.appointments)
      .set({ createdAt: new Date(now.getTime() - 40 * 60_000) })
      .where(eq(schema.appointments.id, in90m.id));
    const r1 = await enqueueDueReminders(db, { now, channels: OFF });
    expect(r1.queued24h).toBeGreaterThanOrEqual(1);
    expect(r1.queued2h).toBeGreaterThanOrEqual(1);
    const r2 = await enqueueDueReminders(db, { now, channels: OFF });
    expect(r2).toEqual({ queued24h: 0, queued2h: 0 });
    const kinds = async (id: string) =>
      (await listNotifications(db, a.clinic.id, { appointmentId: id, limit: 10, offset: 0 })).notifications
        .map((n) => n.template)
        .sort();
    expect(await kinds(in23h.id)).toEqual(["appointment_confirmed", "reminder_24h"]);
    expect(await kinds(in90m.id)).toEqual(["appointment_confirmed", "reminder_2h"]);
    expect(await kinds(in10h.id)).toEqual(["appointment_confirmed"]);
    // a fresh 90-minute booking gets no 2h reminder
    const fresh = await book("+919876600008", new Date(now.getTime() + 1.5 * H));
    await enqueueDueReminders(db, { now, channels: OFF });
    expect(await kinds(fresh.id)).toEqual(["appointment_confirmed"]);
  });
});
```

Create `packages/core/src/notifications/index.ts` exporting `templates.js`, `outbox.js`, `reminders.js`; in `packages/core/src/index.ts` replace the Task 3 line with `export * from "./notifications/index.js";`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/core/src/notifications/outbox.test.ts` → FAIL.

- [ ] **Step 3: Implement outbox.ts**

```ts
import { and, asc, count, desc, eq, isNull, lte, or } from "drizzle-orm";
import { schema, newId, type Db } from "@muxaris/db";
import {
  clinicNotificationSettings,
  maskEmail,
  maskPhone,
  type ChannelFlags,
  type NotificationKind,
  type SkipReason,
} from "@muxaris/shared";
import type { DbLike } from "../services/db-types.js";
import { CoreError } from "../services/errors.js";
import { formatWhen, renderNotification, templateLanguage } from "./templates.js";

const { notifications, appointments, patients, doctors, services, clinics } = schema;

export type NotificationRow = typeof notifications.$inferSelect;
export type NotificationView = Omit<NotificationRow, "to"> & { toMasked: string };
export function toNotificationView(row: NotificationRow): NotificationView {
  const { to, ...rest } = row;
  const toMasked = !to ? "" : row.channel === "email" ? maskEmail(to) : maskPhone(to);
  return { ...rest, toMasked };
}

export const MAX_ATTEMPTS = 5;
const DEFAULT_RETRY_MS = 5 * 60_000;
const REMINDER_KINDS: NotificationKind[] = ["reminder_24h", "reminder_2h"];

/** Email when on file; else WhatsApp, then SMS when the platform flags allow; else nothing. */
export function chooseChannel(
  patient: { email: string | null; phone: string },
  channels: ChannelFlags,
): { channel: "email" | "sms" | "whatsapp"; to: string } | null {
  if (patient.email) return { channel: "email", to: patient.email };
  if (channels.whatsapp) return { channel: "whatsapp", to: patient.phone };
  if (channels.sms) return { channel: "sms", to: patient.phone };
  return null;
}

async function loadContext(tx: DbLike, clinicId: string, appointmentId: string) {
  const [apt] = await tx
    .select()
    .from(appointments)
    .where(and(eq(appointments.id, appointmentId), eq(appointments.clinicId, clinicId)));
  if (!apt) throw new CoreError("not_found", "appointment not found");
  const [[patient], [doctor], [service], [clinic]] = await Promise.all([
    tx.select().from(patients).where(eq(patients.id, apt.patientId)),
    tx.select({ name: doctors.name }).from(doctors).where(eq(doctors.id, apt.doctorId)),
    tx.select({ name: services.name }).from(services).where(eq(services.id, apt.serviceId)),
    tx.select().from(clinics).where(eq(clinics.id, clinicId)),
  ]);
  if (!patient || !clinic) throw new CoreError("not_found", "appointment context missing");
  return { apt, patient, doctorName: doctor?.name ?? "", serviceName: service?.name ?? "", clinic };
}

/**
 * Writes one fully rendered outbox row for an appointment event, inside the caller's transaction.
 * Returns null when the clinic has switched that kind of message off.
 */
export async function queueAppointmentNotification(
  tx: DbLike,
  input: {
    clinicId: string;
    appointmentId: string;
    kind: NotificationKind;
    channels: ChannelFlags;
    now?: Date;
  },
): Promise<NotificationRow | null> {
  const { apt, patient, doctorName, serviceName, clinic } = await loadContext(
    tx,
    input.clinicId,
    input.appointmentId,
  );
  const settings = clinicNotificationSettings(clinic.settings);
  const isReminder = REMINDER_KINDS.includes(input.kind);
  if (isReminder ? !settings.reminders : !settings.confirmations) return null;
  const lang = templateLanguage(patient.preferredLanguage);
  const rendered = renderNotification(input.kind, lang, {
    patientName: patient.name,
    clinicName: clinic.name,
    doctorName,
    serviceName,
    when: formatWhen(apt.startsAt, clinic.timezone, lang),
    clinicPhone: clinic.phone,
  });
  const target = chooseChannel(patient, input.channels);
  const [row] = await tx
    .insert(notifications)
    .values({
      id: newId("ntf"),
      clinicId: input.clinicId,
      patientId: patient.id,
      appointmentId: apt.id,
      channel: target?.channel ?? "email",
      to: target?.to ?? "",
      template: input.kind,
      language: lang,
      payload: rendered,
      status: target ? "queued" : "skipped",
      error: target ? null : ("no_contact" satisfies SkipReason),
      ...(input.now ? { createdAt: input.now } : {}),
    })
    .returning();
  return row!;
}

/** Claims up to `limit` due rows for one delivery attempt; a crashed worker's rows return after retryAfterMs. */
export async function claimQueuedNotifications(
  db: Db,
  opts: { limit?: number; now?: Date; retryAfterMs?: number } = {},
): Promise<NotificationRow[]> {
  const now = opts.now ?? new Date();
  const retryAt = new Date(now.getTime() + (opts.retryAfterMs ?? DEFAULT_RETRY_MS));
  return db.transaction(async (tx) => {
    const due = await tx
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.status, "queued"),
          or(isNull(notifications.nextAttemptAt), lte(notifications.nextAttemptAt, now)),
        ),
      )
      .orderBy(asc(notifications.createdAt))
      .limit(opts.limit ?? 20)
      .for("update", { skipLocked: true });
    if (due.length === 0) return [];
    const ids = due.map((d) => d.id);
    const rows = await tx
      .update(notifications)
      .set({ attempts: sql`${notifications.attempts} + 1`, nextAttemptAt: retryAt })
      .where(inArray(notifications.id, ids))
      .returning();
    return rows;
  });
}

export async function markNotificationSent(
  db: Db,
  id: string,
  opts: { providerId: string; now?: Date },
): Promise<void> {
  await db
    .update(notifications)
    .set({ status: "sent", providerId: opts.providerId, error: null, sentAt: opts.now ?? new Date() })
    .where(eq(notifications.id, id));
}

export async function markNotificationFailed(
  db: Db,
  id: string,
  opts: { error: string; final: boolean },
): Promise<void> {
  await db
    .update(notifications)
    .set({ error: opts.error.slice(0, 200), ...(opts.final ? { status: "failed" } : {}) })
    .where(eq(notifications.id, id));
}

export async function markNotificationSkipped(
  db: Db,
  id: string,
  opts: { reason: SkipReason },
): Promise<void> {
  await db
    .update(notifications)
    .set({ status: "skipped", error: opts.reason })
    .where(eq(notifications.id, id));
}

export async function listNotifications(
  db: Db,
  clinicId: string,
  opts: {
    status?: NotificationRow["status"];
    appointmentId?: string;
    patientId?: string;
    limit: number;
    offset: number;
  },
): Promise<{ notifications: NotificationView[]; total: number }> {
  const where = and(
    eq(notifications.clinicId, clinicId),
    opts.status ? eq(notifications.status, opts.status) : undefined,
    opts.appointmentId ? eq(notifications.appointmentId, opts.appointmentId) : undefined,
    opts.patientId ? eq(notifications.patientId, opts.patientId) : undefined,
  );
  const [rows, [tot]] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(where)
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(opts.limit)
      .offset(opts.offset),
    db.select({ n: count() }).from(notifications).where(where),
  ]);
  return { notifications: rows.map(toNotificationView), total: Number(tot?.n ?? 0) };
}

/** Staff retry: re-picks the channel from the patient's current contact details. */
export async function retryNotification(
  db: Db,
  input: { clinicId: string; notificationId: string; channels: ChannelFlags },
): Promise<NotificationView> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(notifications)
      .where(and(eq(notifications.id, input.notificationId), eq(notifications.clinicId, input.clinicId)))
      .for("update");
    if (!row) throw new CoreError("not_found", "notification not found");
    if (row.status !== "failed" && row.status !== "skipped")
      throw new CoreError("conflict", `cannot retry a ${row.status} notification`);
    const [patient] = row.patientId
      ? await tx.select().from(patients).where(eq(patients.id, row.patientId))
      : [];
    const target = patient ? chooseChannel(patient, input.channels) : null;
    const [updated] = await tx
      .update(notifications)
      .set(
        target
          ? { status: "queued", channel: target.channel, to: target.to, attempts: 0, nextAttemptAt: null, error: null }
          : { status: "skipped", error: "no_contact" satisfies SkipReason },
      )
      .where(eq(notifications.id, row.id))
      .returning();
    return toNotificationView(updated!);
  });
}
```

(Add `sql`, `inArray` to the drizzle import.)

- [ ] **Step 4: Implement reminders.ts**

```ts
import { and, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { schema, type Db } from "@muxaris/db";
import type { ChannelFlags } from "@muxaris/shared";
import { queueAppointmentNotification } from "./outbox.js";

const { appointments } = schema;
const H = 3600_000;
const ACTIVE = ["scheduled", "confirmed", "rescheduled"] as const;

/**
 * 24 h reminder: starts in (20 h, 24 h], not yet stamped.
 * 2 h reminder: starts in (1 h, 2 h], not yet stamped, booked at least 30 min ago (fresh bookings
 * already received a confirmation). Stamps are written in the same transaction as the outbox row,
 * so each reminder is queued at most once even with concurrent sweeps.
 */
export async function enqueueDueReminders(
  db: Db,
  opts: { now?: Date; channels: ChannelFlags },
): Promise<{ queued24h: number; queued2h: number }> {
  const now = opts.now ?? new Date();
  const result = { queued24h: 0, queued2h: 0 };
  await db.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(appointments)
      .where(
        and(
          inArray(appointments.status, [...ACTIVE]),
          or(
            and(
              isNull(appointments.reminder24hSentAt),
              gt(appointments.startsAt, new Date(now.getTime() + 20 * H)),
              lte(appointments.startsAt, new Date(now.getTime() + 24 * H)),
            ),
            and(
              isNull(appointments.reminder2hSentAt),
              gt(appointments.startsAt, new Date(now.getTime() + 1 * H)),
              lte(appointments.startsAt, new Date(now.getTime() + 2 * H)),
              lte(appointments.createdAt, new Date(now.getTime() - 30 * 60_000)),
            ),
          ),
        ),
      )
      .limit(200)
      .for("update", { skipLocked: true });
    for (const apt of due) {
      const until = apt.startsAt.getTime() - now.getTime();
      const kind = until > 2 * H ? "reminder_24h" : "reminder_2h";
      await tx
        .update(appointments)
        .set(kind === "reminder_24h" ? { reminder24hSentAt: now } : { reminder2hSentAt: now })
        .where(eq(appointments.id, apt.id));
      await queueAppointmentNotification(tx, {
        clinicId: apt.clinicId,
        appointmentId: apt.id,
        kind,
        channels: opts.channels,
        now,
      });
      if (kind === "reminder_24h") result.queued24h++;
      else result.queued2h++;
    }
  });
  return result;
}
```

(import `eq` too.)

- [ ] **Step 5: Hook booking, reschedule, cancel**

In `scheduling.ts` add `import type { ChannelFlags } from "@muxaris/shared";` and `import { queueAppointmentNotification } from "../notifications/outbox.js";`. Add to each of the three input types:

```ts
    /** When set, an outbox row for this change is written in the same transaction. */
    notify?: ChannelFlags;
```

In `bookAppointment` after the insert `.returning()`:

```ts
    if (input.notify)
      await queueAppointmentNotification(tx, {
        clinicId: input.clinicId,
        appointmentId: row!.id,
        kind: "appointment_confirmed",
        channels: input.notify,
      });
    return row!;
```

In `rescheduleAppointment` after its update (before `return row`): same with `kind: "appointment_rescheduled"`. In `cancelAppointment` after its update, same with `kind: "appointment_cancelled"` (not on the early `return apt` path for already-cancelled rows).

- [ ] **Step 6: Run tests, gate, commit**

Run: `npm run build -w @muxaris/core && npx vitest run packages/core && npm run typecheck && npm run lint && npx prettier --check .`
Expected: PASS (the API and gateway still compile because `notify` is optional).

```bash
git add packages/core
git commit -m "feat(core): notification outbox, reminder sweep and booking hooks"
```

---

### Task 5: API routes for patients, outcomes, reveals, notifications and settings

**Files:**
- Create: `apps/api/src/routes/patients.ts`, `apps/api/src/routes/notifications.ts`
- Modify: `apps/api/src/routes/appointments.ts` (remove `GET /patients`; add `POST /appointments/:id/status`; pass `notify`), `apps/api/src/routes/callbacks.ts` (reveal), `apps/api/src/routes/me.ts` (nested settings merge), `apps/api/src/deps.ts` (`channels`), `apps/api/src/app.ts` (register), `apps/api/src/index.ts`, `apps/api/src/env.ts`
- Test: `apps/api/src/routes/patients.test.ts` (new), `apps/api/src/routes/notifications.test.ts` (new), `apps/api/src/routes/callbacks.test.ts` (add reveal case)

**Interfaces:**
- Consumes: Task 2 and Task 4 core functions; Task 1 bodies (`patientBody`, `patientPatchBody`, `patientsQuery`, `appointmentStatusBody`, `notificationsQuery`, `clinicSettingsPatchBody`, `channelFlagsFromEnv`).
- Produces (HTTP, all under `/v1`, member unless stated):
  - `GET /patients?q&limit&offset` → `{ patients: Patient[], total }` (masked)
  - `POST /patients` (patientBody) → 201 `{ patient }`; 409 `conflict` on duplicate phone
  - `GET /patients/:id` → `PatientDetail`
  - `PATCH /patients/:id` (patientPatchBody) → `{ patient }`
  - `POST /patients/:id/reveal-phone` → `{ phone }` (audited)
  - `POST /callbacks/:id/reveal-phone` → `{ phone }`; 409 when purged
  - `POST /appointments/:id/status` (appointmentStatusBody) → `{ appointment }` (with patient join)
  - `GET /notifications?status&appointmentId&patientId&limit&offset` → `{ notifications: Notification[], total }`
  - `POST /notifications/:id/retry` → `{ notification }`
  - `PATCH /clinics/:id` accepts `settings.notifications.{confirmations,reminders}` and merges nested keys (owner)
  - `AppDeps.channels: ChannelFlags` (default `{ sms:false, whatsapp:false }` when omitted); `appointmentRoutes(db, channels)`, `notificationRoutes(db, channels)`.

- [ ] **Step 1: Failing tests**

Create `apps/api/src/routes/patients.test.ts` using the exact harness from `callbacks.test.ts` lines 1-62 (copy the `dbReachable`, `tok`, `call`, `mkClinic`, `afterAll` block verbatim with subs `patients-a-${run}` / `patients-b-${run}`), then:

```ts
d("patient routes", () => {
  let ca = "";
  let cb = "";
  beforeAll(async () => {
    ca = await mkClinic(subs[0]!, "Pat A");
    cb = await mkClinic(subs[1]!, "Pat B");
  });

  it("creates, lists masked, rejects duplicates and bad emails", async () => {
    const res = await call("POST", "/patients", {
      sub: subs[0]!,
      clinic: ca,
      body: { phone: "9876543210", name: "Ravi", email: " ravi@example.test " },
    });
    expect(res.status).toBe(201);
    const { patient } = (await res.json()) as J;
    expect(patient.phoneMasked).toBe("+91 •••• ••3210");
    expect(patient.phone).toBeUndefined();
    expect(patient.email).toBe("ravi@example.test");
    expect(
      (await call("POST", "/patients", { sub: subs[0]!, clinic: ca, body: { phone: "9876543210" } }))
        .status,
    ).toBe(409);
    expect(
      (
        await call("PATCH", `/patients/${patient.id}`, {
          sub: subs[0]!,
          clinic: ca,
          body: { email: " bad " },
        })
      ).status,
    ).toBe(400);
    const list = (await (await call("GET", "/patients?q=rav", { sub: subs[0]!, clinic: ca })).json()) as J;
    expect(list.total).toBe(1);
    expect(JSON.stringify(list)).not.toContain("9876543210");
    // tenant isolation
    expect((await call("GET", `/patients/${patient.id}`, { sub: subs[1]!, clinic: cb })).status).toBe(404);
  });

  it("updates, reveals with an audit row, and shows detail", async () => {
    const { patient } = (await (
      await call("POST", "/patients", { sub: subs[0]!, clinic: ca, body: { phone: "9876543211" } })
    ).json()) as J;
    const up = await call("PATCH", `/patients/${patient.id}`, {
      sub: subs[0]!,
      clinic: ca,
      body: { name: "Meena", preferredLanguage: "kn-IN", notes: null },
    });
    expect(up.status).toBe(200);
    expect(((await up.json()) as J).patient.preferredLanguage).toBe("kn-IN");
    const rev = await call("POST", `/patients/${patient.id}/reveal-phone`, { sub: subs[0]!, clinic: ca });
    expect(rev.status).toBe(200);
    expect(((await rev.json()) as J).phone).toBe("+919876543211");
    const [aud] = await db.select().from(schema.auditLog).where(eq(schema.auditLog.entityId, patient.id));
    expect(aud?.action).toBe("patient.phone.reveal");
    const det = (await (await call("GET", `/patients/${patient.id}`, { sub: subs[0]!, clinic: ca })).json()) as J;
    expect(det.patient.id).toBe(patient.id);
    expect(Array.isArray(det.appointments)).toBe(true);
    expect(Array.isArray(det.calls)).toBe(true);
  });

  it("marks a past appointment as no-show and refuses a future one", async () => {
    // create doctor + service through the catalog routes, book in the past with allowOutsideRules
    const doc = (await (
      await call("POST", "/doctors", { sub: subs[0]!, clinic: ca, body: { name: "Dr Rao" } })
    ).json()) as J;
    const svc = (await (
      await call("POST", "/services", { sub: subs[0]!, clinic: ca, body: { name: "Cleaning", durationMin: 30 } })
    ).json()) as J;
    const past = new Date(Date.now() - 2 * 86_400_000);
    past.setUTCHours(5, 30, 0, 0);
    const booked = await call("POST", "/appointments", {
      sub: subs[0]!,
      clinic: ca,
      body: {
        patient: { phone: "9876543212" },
        doctorId: doc.doctor.id,
        serviceId: svc.service.id,
        startsAt: past.toISOString(),
        allowOutsideRules: true,
      },
    });
    expect(booked.status).toBe(201);
    const apt = ((await booked.json()) as J).appointment;
    const ns = await call("POST", `/appointments/${apt.id}/status`, { sub: subs[0]!, clinic: ca, body: { status: "no_show" } });
    expect(ns.status).toBe(200);
    expect(((await ns.json()) as J).appointment.status).toBe("no_show");
    expect(((await ns.json().catch(() => ({}))) as J).appointment?.patient?.phoneMasked ?? "x").toBeDefined();
    const future = new Date(Date.now() + 3 * 86_400_000);
    future.setUTCHours(5, 30, 0, 0);
    const b2 = (await (
      await call("POST", "/appointments", {
        sub: subs[0]!,
        clinic: ca,
        body: { patient: { phone: "9876543212" }, doctorId: doc.doctor.id, serviceId: svc.service.id, startsAt: future.toISOString(), allowOutsideRules: true },
      })
    ).json()) as J;
    expect((await call("POST", `/appointments/${b2.appointment.id}/status`, { sub: subs[0]!, clinic: ca, body: { status: "completed" } })).status).toBe(409);
  });
});
```

(Read `routes.test.ts` for the exact doctor/service POST body shapes if they differ from `{ name }` / `{ name, durationMin }` and adapt. The `ns.json()` is consumed once; drop the second read line if it fails, the point is the first assertion.)

Create `apps/api/src/routes/notifications.test.ts` with the same harness (subs `ntf-a-${run}`, `ntf-b-${run}`) and:

```ts
d("notification routes", () => {
  let ca = "";
  let cb = "";
  beforeAll(async () => {
    ca = await mkClinic(subs[0]!, "Ntf A");
    cb = await mkClinic(subs[1]!, "Ntf B");
  });

  it("booking writes an outbox row; staff can list, retry after adding an email, and toggle settings", async () => {
    const doc = (await (await call("POST", "/doctors", { sub: subs[0]!, clinic: ca, body: { name: "Dr Rao" } })).json()) as J;
    const svc = (await (await call("POST", "/services", { sub: subs[0]!, clinic: ca, body: { name: "Cleaning", durationMin: 30 } })).json()) as J;
    const t = new Date(Date.now() + 3 * 86_400_000);
    t.setUTCHours(5, 30, 0, 0);
    const booked = (await (
      await call("POST", "/appointments", {
        sub: subs[0]!,
        clinic: ca,
        body: { patient: { phone: "9876543300", name: "Asha" }, doctorId: doc.doctor.id, serviceId: svc.service.id, startsAt: t.toISOString(), allowOutsideRules: true },
      })
    ).json()) as J;
    const aptId = booked.appointment.id as string;
    const l = (await (await call("GET", `/notifications?appointmentId=${aptId}`, { sub: subs[0]!, clinic: ca })).json()) as J;
    expect(l.total).toBe(1);
    expect(l.notifications[0].status).toBe("skipped");
    expect(l.notifications[0].error).toBe("no_contact");
    expect(l.notifications[0].to).toBeUndefined();
    const other = (await (await call("GET", `/notifications?appointmentId=${aptId}`, { sub: subs[1]!, clinic: cb })).json()) as J;
    expect(other.total).toBe(0);

    await call("PATCH", `/patients/${booked.appointment.patientId}`, { sub: subs[0]!, clinic: ca, body: { email: "asha@example.test" } });
    const retry = await call("POST", `/notifications/${l.notifications[0].id}/retry`, { sub: subs[0]!, clinic: ca });
    expect(retry.status).toBe(200);
    expect(((await retry.json()) as J).notification).toMatchObject({ status: "queued", toMasked: "a•••@example.test" });
    expect((await call("POST", `/notifications/${l.notifications[0].id}/retry`, { sub: subs[0]!, clinic: ca })).status).toBe(409);

    const patched = await call("PATCH", `/clinics/${ca}`, { sub: subs[0]!, clinic: ca, body: { settings: { notifications: { reminders: false } } } });
    expect(patched.status).toBe(200);
    expect(((await patched.json()) as J).clinic.settings.notifications).toEqual({ reminders: false });
    const p2 = (await (await call("PATCH", `/clinics/${ca}`, { sub: subs[0]!, clinic: ca, body: { settings: { recordCalls: false } } })).json()) as J;
    expect(p2.clinic.settings).toEqual({ recordCalls: false, notifications: { reminders: false } });
    const p3 = (await (await call("PATCH", `/clinics/${ca}`, { sub: subs[0]!, clinic: ca, body: { settings: { notifications: { confirmations: false } } } })).json()) as J;
    expect(p3.clinic.settings.notifications).toEqual({ reminders: false, confirmations: false });
  });
});
```

Add to `callbacks.test.ts` inside its describe (a callback created directly via `createCallback` from `@muxaris/core` on clinic `ca`):

```ts
  it("reveals a callback phone (audited) and 404s across tenants", async () => {
    const cbRow = await createCallback(db, { clinicId: ca, phone: "+919876500100", reason: "x" });
    const r = await call("POST", `/callbacks/${cbRow.id}/reveal-phone`, { sub: subs[0]!, clinic: ca });
    expect(r.status).toBe(200);
    expect(((await r.json()) as J).phone).toBe("+919876500100");
    expect((await call("POST", `/callbacks/${cbRow.id}/reveal-phone`, { sub: subs[1]!, clinic: cb })).status).toBe(404);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run apps/api/src/routes/patients.test.ts apps/api/src/routes/notifications.test.ts apps/api/src/routes/callbacks.test.ts` → FAIL (404s on new routes).

- [ ] **Step 3: Implement**

`apps/api/src/deps.ts`: add `import type { ChannelFlags } from "@muxaris/shared";` and `channels?: ChannelFlags;` to `AppDeps`.

`apps/api/src/env.ts`: add `channels: ChannelFlags` to `ApiEnv`, set `channels: channelFlagsFromEnv(src)` in `loadEnv`. `apps/api/src/index.ts`: pass `channels: env.channels` to `createApp`. In `app.ts` compute `const channels = deps.channels ?? { sms: false, whatsapp: false };` and register `patientRoutes(db)`, `notificationRoutes(db, channels)`, and change `appointmentRoutes(db)` to `appointmentRoutes(db, channels)`.

Create `apps/api/src/routes/patients.ts`:

```ts
import { Hono } from "hono";
import {
  createPatient,
  getPatient,
  listPatients,
  revealPatientPhone,
  updatePatient,
} from "@muxaris/core";
import type { Db } from "@muxaris/db";
import { patientBody, patientPatchBody, patientsQuery } from "@muxaris/shared";
import type { AppEnv } from "../deps.js";
import { requireClinic } from "../auth/middleware.js";
import { v } from "../validate.js";

export function patientRoutes(db: Db) {
  const r = new Hono<AppEnv>();
  const member = requireClinic(db);

  r.get("/patients", member, v("query", patientsQuery), async (c) => {
    return c.json(await listPatients(db, c.get("clinic").id, c.req.valid("query")));
  });

  r.post("/patients", member, v("json", patientBody), async (c) => {
    const b = c.req.valid("json");
    const patient = await createPatient(db, c.get("clinic").id, {
      phone: b.phone,
      ...(b.name ? { name: b.name } : {}),
      ...(b.email ? { email: b.email } : {}),
      ...(b.preferredLanguage ? { preferredLanguage: b.preferredLanguage } : {}),
      ...(b.dob ? { dob: b.dob } : {}),
      ...(b.notes ? { notes: b.notes } : {}),
    });
    return c.json({ patient }, 201);
  });

  r.get("/patients/:id", member, async (c) => {
    return c.json(await getPatient(db, c.get("clinic").id, c.req.param("id")));
  });

  r.patch("/patients/:id", member, v("json", patientPatchBody), async (c) => {
    const b = c.req.valid("json");
    const patient = await updatePatient(db, c.get("clinic").id, c.req.param("id"), {
      ...(b.name !== undefined ? { name: b.name ?? null } : {}),
      ...(b.email !== undefined ? { email: b.email ?? null } : {}),
      ...(b.preferredLanguage ? { preferredLanguage: b.preferredLanguage } : {}),
      ...(b.dob !== undefined ? { dob: b.dob ?? null } : {}),
      ...(b.notes !== undefined ? { notes: b.notes ?? null } : {}),
    });
    return c.json({ patient });
  });

  /** Audited: every reveal writes an audit_log row. The number is never logged. */
  r.post("/patients/:id/reveal-phone", member, async (c) => {
    return c.json(
      await revealPatientPhone(db, {
        clinicId: c.get("clinic").id,
        patientId: c.req.param("id"),
        actorUserId: c.get("user").id,
      }),
    );
  });
  return r;
}
```

Create `apps/api/src/routes/notifications.ts`:

```ts
import { Hono } from "hono";
import { listNotifications, retryNotification } from "@muxaris/core";
import type { Db } from "@muxaris/db";
import { notificationsQuery, type ChannelFlags } from "@muxaris/shared";
import type { AppEnv } from "../deps.js";
import { requireClinic } from "../auth/middleware.js";
import { v } from "../validate.js";

export function notificationRoutes(db: Db, channels: ChannelFlags) {
  const r = new Hono<AppEnv>();
  const member = requireClinic(db);

  r.get("/notifications", member, v("query", notificationsQuery), async (c) => {
    return c.json(await listNotifications(db, c.get("clinic").id, c.req.valid("query")));
  });

  r.post("/notifications/:id/retry", member, async (c) => {
    const notification = await retryNotification(db, {
      clinicId: c.get("clinic").id,
      notificationId: c.req.param("id"),
      channels,
    });
    return c.json({ notification });
  });
  return r;
}
```

`appointments.ts`: signature `appointmentRoutes(db: Db, channels: ChannelFlags)`; delete the `r.get("/patients", …)` handler and `patientsQuery`/`ilike`/`or`/`desc` imports if now unused; add `notify: channels` to the `bookAppointment`, `rescheduleAppointment` and `cancelAppointment` calls; add:

```ts
  r.post("/appointments/:id/status", member, v("json", appointmentStatusBody), async (c) => {
    const appointment = await setAppointmentOutcome(db, {
      clinicId: c.get("clinic").id,
      appointmentId: c.req.param("id"),
      status: c.req.valid("json").status,
      actorUserId: c.get("user").id,
    });
    const [withPatient] = await attachPatients(db, c.get("clinic").id, [appointment]);
    return c.json({ appointment: withPatient });
  });
```

`callbacks.ts`: add

```ts
  r.post("/callbacks/:id/reveal-phone", member, async (c) => {
    return c.json(
      await revealCallbackPhone(db, {
        clinicId: c.get("clinic").id,
        callbackId: c.req.param("id"),
        actorUserId: c.get("user").id,
      }),
    );
  });
```

`me.ts` `PATCH /clinics/:id`: replace the single `settings || $body` write with a read-merge-write inside a transaction so nested `notifications` keys merge:

```ts
    const { settings } = c.req.valid("json");
    const clinic = await db.transaction(async (tx) => {
      const [cur] = await tx
        .select({ settings: schema.clinics.settings })
        .from(schema.clinics)
        .where(eq(schema.clinics.id, clinicId))
        .for("update");
      if (!cur) throw new CoreError("not_found", "clinic not found");
      const prev = (cur.settings ?? {}) as Record<string, unknown>;
      const prevN = (prev["notifications"] ?? {}) as Record<string, unknown>;
      const next: Record<string, unknown> = { ...prev, ...settings };
      if (settings.notifications) next["notifications"] = { ...prevN, ...settings.notifications };
      const [row] = await tx
        .update(schema.clinics)
        .set({ settings: next, updatedAt: new Date() })
        .where(eq(schema.clinics.id, clinicId))
        .returning();
      return row!;
    });
```

(keep the existing owner check and response shape `{ clinic }` around it; read `me.ts:60-85` for the surrounding code.)

- [ ] **Step 4: Run tests, gate, commit**

Run: `npx vitest run apps/api && npm run typecheck && npm run lint && npx prettier --check .`
Expected: PASS (including the pre-existing `routes.test.ts`, which must not reference `GET /patients`; if it does, update it to expect the masked `{ patients, total }` shape).

```bash
git add apps/api
git commit -m "feat(api): patient routes, appointment outcomes, audited phone reveals, notification outbox"
```

---

### Task 6: Gateway: notify on AI bookings, auto-create patients from callbacks, link calls to patients

**Files:**
- Modify: `apps/voice-gateway/src/env.ts` (`channels`), `apps/voice-gateway/src/server.ts` (pass `channels` into ctx; nothing else), `apps/voice-gateway/src/session/tools.ts`, `apps/voice-gateway/src/session/voice-session.ts` (pass `patientId` to `finishCall`)
- Test: `apps/voice-gateway/src/session/tools.test.ts` (add cases; read the existing file for its harness)

**Interfaces:**
- Consumes: `channelFlagsFromEnv`, `ChannelFlags` (Task 1); `bookAppointment`/`rescheduleAppointment`/`cancelAppointment` `notify` (Task 4); `upsertPatientByPhone`; `finishCall({ patientId })` (Task 2).
- Produces: `ToolContext.channels: ChannelFlags` (required, new) and `ToolContext.patientId?: string` (set by `executeTool` when a patient is bound: after `book_appointment`, after a found `lookup_patient`, after a linkable `request_callback`). `VoiceSession` passes `patientId: this.ctx.patientId` to `finishCall` when set.

- [ ] **Step 1: Failing tests**

In `apps/voice-gateway/src/session/tools.test.ts` (Postgres-gated, uses the helpers in `session/test-helpers.ts`), add, mirroring the existing `book_appointment` and `request_callback` cases:

```ts
  it("book_appointment writes a confirmation outbox row and binds the patient", async () => {
    const ctx = mkCtx({ channels: { sms: false, whatsapp: false } });
    const slot = /* the same next-available slot the existing booking test uses */;
    const r = await executeTool(db, ctx, "book_appointment", {
      patient_phone: "9876511111",
      patient_name: "ravi",
      doctor_id: doctorId,
      service_id: serviceId,
      starts_at: slot,
    });
    expect((r.result as { booked?: boolean }).booked ?? true).toBeTruthy();
    expect(ctx.patientId).toBeDefined();
    const rows = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.patientId, ctx.patientId!));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ template: "appointment_confirmed", status: "skipped", error: "no_contact" });
  });

  it("request_callback creates the patient record when the number is the bound one", async () => {
    const ctx = mkCtx({ channels: { sms: false, whatsapp: false } });
    await executeTool(db, ctx, "lookup_patient", { patient_phone: "9876522222" }); // binds claimedPhone
    const r = await executeTool(db, ctx, "request_callback", {
      patient_phone: "9876522222",
      patient_name: "meena",
      reason: "wants a quote",
      priority: "normal",
    });
    const cbId = (r.result as { callback_id: string }).callback_id;
    const [cb] = await db.select().from(schema.callbacks).where(eq(schema.callbacks.id, cbId));
    expect(cb?.patientId).toBeTruthy();
    const [p] = await db.select().from(schema.patients).where(eq(schema.patients.id, cb!.patientId!));
    expect(p?.name).toBe("Meena");
    expect(p?.preferredLanguage).toBe(ctx.language);
    expect(ctx.patientId).toBe(p?.id);
  });
```

Adapt `mkCtx`, `doctorId`, `serviceId`, slot derivation and the `lookup_patient` argument name to the existing test file's helpers (read it first; the behaviour asserted above is the requirement, the helper names are not).

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run apps/voice-gateway/src/session/tools.test.ts` → FAIL (`channels` not a known ctx key / no outbox row / patient not created).

- [ ] **Step 3: Implement**

`env.ts`: add `channels: ChannelFlags` to `VoiceEnv` and `channels: channelFlagsFromEnv(src)` in `loadEnv`.

`tools.ts` `ToolContext`: add

```ts
  /** Platform channel flags for outbox rows written by booking tools. */
  channels: ChannelFlags;
  /** Patient bound to this call (set once a tool identifies one); persisted on the call row. */
  patientId?: string | undefined;
```

In `book_appointment`: pass `notify: ctx.channels` to `bookAppointment`; after it returns set `ctx.patientId = apt.patientId`. In `reschedule_appointment` and `cancel_appointment`: pass `notify: ctx.channels`. In `lookup_patient`: when a patient is found set `ctx.patientId = patient.id`. In `request_callback`, replace the `const patient = linkable ? await findPatientByPhone(...) : null;` line with:

```ts
      // Auto-create the record on a verified-enough number so staff see who to call back.
      const patient = linkable
        ? ((await findPatientByPhone(db, clinicId, stated)) ??
          (await upsertPatientByPhone(db, clinicId, {
            phone: stated,
            ...(a.patient_name ? { name: titleCaseName(a.patient_name) } : {}),
            preferredLanguage: ctx.language,
          })))
        : null;
      if (patient) ctx.patientId = patient.id;
```

`server.ts`: in the ctx literal add `channels: env.channels` (the `env` object is already in scope where `ctx` is built; if it is not, thread it the same way `callsBucket` reaches the session). `voice-session.ts` `finishCall` call: add `...(this.ctx.patientId ? { patientId: this.ctx.patientId } : {}),`. Fix every other `ToolContext` construction (`test-helpers.ts`, `voice-session.test.ts`, `server.test.ts`) by adding `channels: { sms: false, whatsapp: false }`.

- [ ] **Step 4: Run tests, gate, commit**

Run: `npx vitest run apps/voice-gateway && npm run typecheck && npm run lint && npx prettier --check .`
Expected: PASS.

```bash
git add apps/voice-gateway
git commit -m "feat(gateway): outbox rows for AI bookings, auto-create patients on callbacks, link calls to patients"
```

---

### Task 7: Notifier worker: providers, delivery loop, reminder sweep, Lambda handlers

**Files:**
- Create: `workers/notifier/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/env.ts`, `src/log.ts`, `src/providers/types.ts`, `src/providers/console.ts`, `src/providers/ses.ts`, `src/providers/sns.ts`, `src/providers/whatsapp.ts`, `src/providers/select.ts`, `src/deliver.ts`, `src/lambda.ts`, `src/dev.ts`, `src/test-support.ts`
- Modify: `package.json` (root `build` list, `workers:dev`), `scripts/dev.sh`, `.env.example`, `workers/post-call/src/dev.ts` and `lambda.ts` (add `purgeExpiredCallbacks` to the sweep)
- Test: `workers/notifier/src/deliver.test.ts`, `workers/notifier/src/providers/select.test.ts`, `workers/notifier/src/env.test.ts`

**Interfaces:**
- Consumes: Task 4 `claimQueuedNotifications`, `markNotificationSent/Failed/Skipped`, `MAX_ATTEMPTS`, `enqueueDueReminders`; Task 2 `purgeExpiredCallbacks`; `channelFlagsFromEnv`.
- Produces:
  - `interface NotificationProvider { readonly channel: NotificationChannel; send(msg: { to: string; subject: string; body: string }): Promise<{ providerId: string }> }`
  - `buildProviders(env: NotifierEnv, log: LogFn) → Record<NotificationChannel, NotificationProvider | null>`
  - `deliverOnce(deps: DeliverDeps, limit?) → Promise<{ sent: number; retried: number; failed: number; skipped: number }>`
  - Lambda exports `deliverHandler`, `remindersHandler`; dev loop `npm run dev -w @muxaris/worker-notifier`.
  - Env keys: `NOTIFY_PROVIDER` (`console` | `aws`; default `aws` when `NOTIFY_FROM_EMAIL` is set, else `console`), `NOTIFY_FROM_EMAIL`, `SMS_ENABLED`, `WHATSAPP_ENABLED`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`.

- [ ] **Step 1: Scaffold the package**

`workers/notifier/package.json`:

```json
{
  "name": "@muxaris/worker-notifier",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx src/dev.ts",
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@aws-sdk/client-sesv2": "^3.1146.0",
    "@aws-sdk/client-sns": "^3.1146.0",
    "@muxaris/core": "^0.1.0",
    "@muxaris/db": "*",
    "@muxaris/shared": "*",
    "drizzle-orm": "^0.45.3",
    "pg": "^8",
    "zod": "^4"
  },
  "devDependencies": {
    "@types/pg": "^8",
    "tsx": "^4",
    "typescript": "^5.9",
    "vitest": "^3"
  }
}
```

Copy `workers/post-call/tsconfig.json`, `vitest.config.ts`, `src/log.ts` and `src/test-support.ts` verbatim. Run `npm install` at the root (lockfile changes are expected and committed). Root `package.json`: add `-w @muxaris/worker-notifier` to the `build` script after the post-call worker, and change `workers:dev` to `"npm run dev -w @muxaris/worker-post-call & npm run dev -w @muxaris/worker-notifier & wait"`.

- [ ] **Step 2: Failing tests**

`src/env.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

describe("notifier env", () => {
  const base = { DATABASE_URL: "postgres://x" };
  it("defaults to the console provider with no from-address", () => {
    const e = loadEnv(base);
    expect(e.providerMode).toBe("console");
    expect(e.channels).toEqual({ sms: false, whatsapp: false });
  });
  it("switches to aws when a from-address is set, and honours flags", () => {
    const e = loadEnv({ ...base, NOTIFY_FROM_EMAIL: "noreply@muxaris.com", SMS_ENABLED: "1" });
    expect(e.providerMode).toBe("aws");
    expect(e.fromEmail).toBe("noreply@muxaris.com");
    expect(e.channels.sms).toBe(true);
  });
  it("refuses aws mode without a from-address and whatsapp without credentials", () => {
    expect(() => loadEnv({ ...base, NOTIFY_PROVIDER: "aws" })).toThrow(/NOTIFY_FROM_EMAIL/);
    expect(() => loadEnv({ ...base, NOTIFY_PROVIDER: "aws", NOTIFY_FROM_EMAIL: "a@b.c", WHATSAPP_ENABLED: "1" })).toThrow(/WHATSAPP_TOKEN/);
  });
});
```

`src/providers/select.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { loadEnv } from "../env.js";
import { buildProviders } from "./select.js";

const log = () => undefined;
describe("provider selection", () => {
  it("console mode: email via console, sms/whatsapp only when flagged", () => {
    const p = buildProviders(loadEnv({ DATABASE_URL: "x" }), log);
    expect(p.email?.channel).toBe("email");
    expect(p.sms).toBeNull();
    expect(p.whatsapp).toBeNull();
    const q = buildProviders(loadEnv({ DATABASE_URL: "x", SMS_ENABLED: "1" }), log);
    expect(q.sms?.channel).toBe("sms");
  });
  it("aws mode: SES email, SNS sms when flagged", () => {
    const p = buildProviders(
      loadEnv({ DATABASE_URL: "x", NOTIFY_FROM_EMAIL: "a@b.c", SMS_ENABLED: "true" }),
      log,
    );
    expect(p.email?.constructor.name).toBe("SesEmailProvider");
    expect(p.sms?.constructor.name).toBe("SnsSmsProvider");
    expect(p.whatsapp).toBeNull();
  });
});
```

`src/deliver.test.ts` (Postgres-gated with the copied `test-support.ts`):

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@muxaris/db";
import { bookAppointment, createDoctor, createPatient, createService, setWorkingHours } from "@muxaris/core";
import { deliverOnce } from "./deliver.js";
import type { NotificationProvider } from "./providers/types.js";
import { dbReachable, makeTestClinic, openDb } from "./test-support.js";

const reachable = await dbReachable();
if (!reachable) console.warn("WARNING: Postgres unreachable, skipping notifier tests.");
const { db, pool } = openDb();
const logs: Array<Record<string, unknown>> = [];
const log = (_level: string, _msg: string, fields?: Record<string, unknown>) => {
  logs.push(fields ?? {});
};

class FakeProvider implements NotificationProvider {
  readonly channel = "email" as const;
  sent: Array<{ to: string; subject: string }> = [];
  constructor(private readonly fail = false) {}
  async send(msg: { to: string; subject: string; body: string }) {
    if (this.fail) throw new Error("MessageRejected");
    this.sent.push({ to: msg.to, subject: msg.subject });
    return { providerId: `fake-${this.sent.length}` };
  }
}

describe.skipIf(!reachable)("deliverOnce", () => {
  let c: Awaited<ReturnType<typeof makeTestClinic>>;
  let doctorId = "";
  let serviceId = "";
  beforeAll(async () => {
    c = await makeTestClinic(db, "notifier");
    const doc = await createDoctor(db, c.clinic.id, { name: "Dr Rao" });
    await setWorkingHours(db, c.clinic.id, doc.id, [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start: "00:00", end: "23:59" })));
    doctorId = doc.id;
    serviceId = (await createService(db, c.clinic.id, { name: "Cleaning", durationMin: 30 })).id;
  });
  afterAll(async () => {
    await c.cleanup();
    await pool.end();
  });

  async function queuedRow(phone: string, email: string) {
    await createPatient(db, c.clinic.id, { phone, email });
    const apt = await bookAppointment(db, {
      clinicId: c.clinic.id,
      patient: { phone },
      doctorId,
      serviceId,
      startsAt: new Date(Date.now() + 2 * 86_400_000),
      source: "dashboard",
      allowOutsideRules: true,
      notify: { sms: false, whatsapp: false },
    });
    const [row] = await db.select().from(schema.notifications).where(eq(schema.notifications.appointmentId, apt.id));
    return row!;
  }

  it("sends queued email rows and records the provider id, logging no recipient", async () => {
    const row = await queuedRow("+919876700001", "one@example.test");
    const email = new FakeProvider();
    const r = await deliverOnce({ db, providers: { email, sms: null, whatsapp: null }, log }, 50);
    expect(r.sent).toBeGreaterThanOrEqual(1);
    expect(email.sent.some((s) => s.to === "one@example.test")).toBe(true);
    const [after] = await db.select().from(schema.notifications).where(eq(schema.notifications.id, row.id));
    expect(after?.status).toBe("sent");
    expect(after?.providerId).toMatch(/^fake-/);
    expect(JSON.stringify(logs)).not.toContain("example.test");
  });

  it("retries failures and finalises after five attempts", async () => {
    const row = await queuedRow("+919876700002", "two@example.test");
    const failing = new FakeProvider(true);
    let now = new Date();
    for (let i = 1; i <= 5; i++) {
      const r = await deliverOnce({ db, providers: { email: failing, sms: null, whatsapp: null }, log, now: () => now }, 50);
      expect(r.failed + r.retried).toBeGreaterThanOrEqual(1);
      now = new Date(now.getTime() + 6 * 60_000);
    }
    const [after] = await db.select().from(schema.notifications).where(eq(schema.notifications.id, row.id));
    expect(after?.status).toBe("failed");
    expect(after?.attempts).toBe(5);
    expect(after?.error).toBe("MessageRejected");
  });

  it("marks rows skipped when the channel has no provider", async () => {
    const row = await queuedRow("+919876700003", "three@example.test");
    await deliverOnce({ db, providers: { email: null, sms: null, whatsapp: null }, log }, 50);
    const [after] = await db.select().from(schema.notifications).where(eq(schema.notifications.id, row.id));
    expect(after).toMatchObject({ status: "skipped", error: "channel_disabled" });
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run workers/notifier` → FAIL (modules missing).

- [ ] **Step 4: Implement**

`src/env.ts`:

```ts
import { channelFlagsFromEnv, type ChannelFlags } from "@muxaris/shared";

export interface NotifierEnv {
  databaseUrl: string;
  awsRegion: string;
  providerMode: "console" | "aws";
  /** Verified SES sender, e.g. noreply@muxaris.com. Required in aws mode. */
  fromEmail: string | null;
  channels: ChannelFlags;
  whatsappToken: string | null;
  whatsappPhoneId: string | null;
}

export function loadEnv(src: NodeJS.ProcessEnv = process.env): NotifierEnv {
  let databaseUrl = src.DATABASE_URL;
  if (!databaseUrl) {
    if (src.NODE_ENV === "production")
      throw new Error("DATABASE_URL is required (see .env.example)");
    databaseUrl = "postgres://muxaris:muxaris@localhost:5433/muxaris";
    console.warn("DATABASE_URL not set: using local dev default (localhost:5433)");
  }
  const fromEmail = src.NOTIFY_FROM_EMAIL?.trim() || null;
  const mode = (src.NOTIFY_PROVIDER?.trim() || (fromEmail ? "aws" : "console")) as string;
  if (mode !== "console" && mode !== "aws")
    throw new Error(`NOTIFY_PROVIDER must be "console" or "aws", got "${mode}"`);
  if (mode === "aws" && !fromEmail) throw new Error("NOTIFY_FROM_EMAIL is required when NOTIFY_PROVIDER=aws");
  const channels = channelFlagsFromEnv(src);
  const whatsappToken = src.WHATSAPP_TOKEN?.trim() || null;
  const whatsappPhoneId = src.WHATSAPP_PHONE_ID?.trim() || null;
  if (mode === "aws" && channels.whatsapp && (!whatsappToken || !whatsappPhoneId))
    throw new Error("WHATSAPP_TOKEN and WHATSAPP_PHONE_ID are required when WHATSAPP_ENABLED=1");
  return {
    databaseUrl,
    awsRegion: src.AWS_REGION?.trim() || "ap-south-1",
    providerMode: mode,
    fromEmail,
    channels,
    whatsappToken,
    whatsappPhoneId,
  };
}
```

`src/providers/types.ts`:

```ts
import type { NotificationChannel } from "@muxaris/shared";
export interface OutboundMessage {
  to: string;
  subject: string;
  body: string;
}
export interface NotificationProvider {
  readonly channel: NotificationChannel;
  /** Resolves with the provider's message id; throws on rejection (error.name is recorded). */
  send(msg: OutboundMessage): Promise<{ providerId: string }>;
}
export type Providers = Record<NotificationChannel, NotificationProvider | null>;
```

`src/providers/console.ts` (local dev; logs kind-level facts only, never the recipient or body):

```ts
import type { NotificationChannel } from "@muxaris/shared";
import type { LogFn } from "../log.js";
import type { NotificationProvider, OutboundMessage } from "./types.js";

export class ConsoleProvider implements NotificationProvider {
  private n = 0;
  constructor(
    readonly channel: NotificationChannel,
    private readonly log: LogFn,
  ) {}
  async send(msg: OutboundMessage) {
    this.n++;
    this.log("info", "notification (console provider)", {
      channel: this.channel,
      subjectLength: msg.subject.length,
      bodyLength: msg.body.length,
    });
    return { providerId: `console:${this.channel}:${Date.now()}:${this.n}` };
  }
}
```

`src/providers/ses.ts`:

```ts
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import type { NotificationProvider, OutboundMessage } from "./types.js";

export class SesEmailProvider implements NotificationProvider {
  readonly channel = "email" as const;
  private readonly client: SESv2Client;
  constructor(private readonly opts: { from: string; region: string; client?: SESv2Client }) {
    this.client = opts.client ?? new SESv2Client({ region: opts.region });
  }
  async send(msg: OutboundMessage) {
    const r = await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: this.opts.from,
        Destination: { ToAddresses: [msg.to] },
        Content: {
          Simple: {
            Subject: { Data: msg.subject, Charset: "UTF-8" },
            Body: { Text: { Data: msg.body, Charset: "UTF-8" } },
          },
        },
      }),
    );
    return { providerId: r.MessageId ?? "ses" };
  }
}
```

`src/providers/sns.ts`:

```ts
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import type { NotificationProvider, OutboundMessage } from "./types.js";

/** Transactional SMS via SNS. Indian delivery needs TRAI DLT registration and sandbox exit. */
export class SnsSmsProvider implements NotificationProvider {
  readonly channel = "sms" as const;
  private readonly client: SNSClient;
  constructor(opts: { region: string; client?: SNSClient }) {
    this.client = opts.client ?? new SNSClient({ region: opts.region });
  }
  async send(msg: OutboundMessage) {
    const r = await this.client.send(
      new PublishCommand({
        PhoneNumber: msg.to,
        Message: msg.body,
        MessageAttributes: {
          "AWS.SNS.SMS.SMSType": { DataType: "String", StringValue: "Transactional" },
        },
      }),
    );
    return { providerId: r.MessageId ?? "sns" };
  }
}
```

`src/providers/whatsapp.ts`:

```ts
import type { NotificationProvider, OutboundMessage } from "./types.js";

/**
 * WhatsApp Cloud API text message. Business-initiated messages outside a 24-hour customer window
 * require an approved message template; v1 sends plain text and documents this limit.
 */
export class WhatsAppCloudProvider implements NotificationProvider {
  readonly channel = "whatsapp" as const;
  constructor(
    private readonly opts: { token: string; phoneId: string; fetchImpl?: typeof fetch },
  ) {}
  async send(msg: OutboundMessage) {
    const f = this.opts.fetchImpl ?? fetch;
    const res = await f(`https://graph.facebook.com/v21.0/${this.opts.phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.opts.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: msg.to.replace(/^\+/, ""),
        type: "text",
        text: { body: `${msg.subject}\n\n${msg.body}` },
      }),
    });
    if (!res.ok) {
      const err = new Error(`whatsapp ${res.status}`);
      err.name = `WhatsAppHttp${res.status}`;
      throw err;
    }
    const data = (await res.json()) as { messages?: Array<{ id?: string }> };
    return { providerId: data.messages?.[0]?.id ?? "whatsapp" };
  }
}
```

`src/providers/select.ts`:

```ts
import type { NotifierEnv } from "../env.js";
import type { LogFn } from "../log.js";
import { ConsoleProvider } from "./console.js";
import { SesEmailProvider } from "./ses.js";
import { SnsSmsProvider } from "./sns.js";
import type { Providers } from "./types.js";
import { WhatsAppCloudProvider } from "./whatsapp.js";

export function buildProviders(env: NotifierEnv, log: LogFn): Providers {
  const aws = env.providerMode === "aws";
  return {
    email: aws
      ? new SesEmailProvider({ from: env.fromEmail!, region: env.awsRegion })
      : new ConsoleProvider("email", log),
    sms: !env.channels.sms
      ? null
      : aws
        ? new SnsSmsProvider({ region: env.awsRegion })
        : new ConsoleProvider("sms", log),
    whatsapp: !env.channels.whatsapp
      ? null
      : aws
        ? new WhatsAppCloudProvider({ token: env.whatsappToken!, phoneId: env.whatsappPhoneId! })
        : new ConsoleProvider("whatsapp", log),
  };
}
```

`src/deliver.ts`:

```ts
import type { Db } from "@muxaris/db";
import {
  MAX_ATTEMPTS,
  claimQueuedNotifications,
  markNotificationFailed,
  markNotificationSent,
  markNotificationSkipped,
} from "@muxaris/core";
import type { LogFn } from "./log.js";
import type { Providers } from "./providers/types.js";

export interface DeliverDeps {
  db: Db;
  providers: Providers;
  log: LogFn;
  now?: () => Date;
}

export async function deliverOnce(deps: DeliverDeps, limit = 20) {
  const now = (deps.now ?? (() => new Date()))();
  const rows = await claimQueuedNotifications(deps.db, { limit, now });
  const r = { sent: 0, retried: 0, failed: 0, skipped: 0 };
  for (const n of rows) {
    const provider = deps.providers[n.channel];
    const payload = (n.payload ?? {}) as { subject?: string; body?: string };
    if (!provider || !n.to || !payload.body) {
      await markNotificationSkipped(deps.db, n.id, { reason: "channel_disabled" });
      r.skipped++;
      deps.log("info", "notification skipped", { id: n.id, channel: n.channel, reason: "channel_disabled" });
      continue;
    }
    try {
      const { providerId } = await provider.send({
        to: n.to,
        subject: payload.subject ?? "",
        body: payload.body,
      });
      await markNotificationSent(deps.db, n.id, { providerId, now });
      r.sent++;
      deps.log("info", "notification sent", { id: n.id, channel: n.channel, template: n.template });
    } catch (e) {
      const name = e instanceof Error ? e.name || "Error" : "Error";
      const final = n.attempts >= MAX_ATTEMPTS;
      await markNotificationFailed(deps.db, n.id, { error: name, final });
      if (final) r.failed++;
      else r.retried++;
      deps.log("warn", "notification send failed", { id: n.id, channel: n.channel, attempt: n.attempts, final, err: name });
    }
  }
  return r;
}
```

`src/lambda.ts`:

```ts
import { createDb } from "@muxaris/db";
import { enqueueDueReminders } from "@muxaris/core";
import { deliverOnce, type DeliverDeps } from "./deliver.js";
import { loadEnv, type NotifierEnv } from "./env.js";
import { jsonLog } from "./log.js";
import { buildProviders } from "./providers/select.js";

let cached: { env: NotifierEnv; deps: DeliverDeps } | null = null;
function get() {
  if (!cached) {
    const env = loadEnv();
    const { db } = createDb(env.databaseUrl);
    cached = { env, deps: { db, providers: buildProviders(env, jsonLog), log: jsonLog } };
  }
  return cached;
}

/** EventBridge rate(1 minute) in Phase 5: drains up to 50 queued rows per run. */
export const deliverHandler = async () => deliverOnce(get().deps, 50);

/** EventBridge rate(15 minutes) in Phase 5: queues 24 h and 2 h reminders. */
export const remindersHandler = async () => {
  const { env, deps } = get();
  return enqueueDueReminders(deps.db, { channels: env.channels });
};
```

`src/dev.ts`:

```ts
import { createDb } from "@muxaris/db";
import { enqueueDueReminders } from "@muxaris/core";
import { deliverOnce } from "./deliver.js";
import { loadEnv } from "./env.js";
import { jsonLog as log } from "./log.js";
import { buildProviders } from "./providers/select.js";

const env = loadEnv();
const { db, pool } = createDb(env.databaseUrl);
const deps = { db, providers: buildProviders(env, log), log };
let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => (stopping = true));
log("info", "notifier started", { providerMode: env.providerMode, sms: env.channels.sms, whatsapp: env.channels.whatsapp });

let lastReminders = 0;
while (!stopping) {
  try {
    if (Date.now() - lastReminders >= 60_000) {
      lastReminders = Date.now();
      const r = await enqueueDueReminders(db, { channels: env.channels });
      if (r.queued24h || r.queued2h) log("info", "reminders queued", r);
    }
    const d = await deliverOnce(deps, 20);
    if (d.sent || d.failed || d.retried || d.skipped) log("info", "delivery pass", d);
  } catch (e) {
    log("error", "notifier pass failed", { err: e instanceof Error ? e.name : "unknown" });
  }
  await new Promise((r) => setTimeout(r, 10_000));
}
await pool.end();
log("info", "notifier stopped");
```

`workers/post-call/src/dev.ts` `sweep()` and `lambda.ts` `sweepHandler`: after `purgeExpiredCalls` also call `purgeExpiredCallbacks(db)` (import from `@muxaris/core`), logging `{ callbacksPurged }`.

`scripts/dev.sh`: after the post-call block add `npm run dev -w @muxaris/worker-notifier &` unconditionally (console provider needs no AWS). `.env.example`: append

```
# Notifications. Console provider by default (logs counts only; the outbox UI shows the messages).
# Set NOTIFY_FROM_EMAIL to a verified SES sender (MuxarisNotify stack + DNS) to send real email.
NOTIFY_PROVIDER=
NOTIFY_FROM_EMAIL=
# 1 enables SMS via SNS (needs TRAI DLT registration and SNS sandbox exit for Indian numbers).
SMS_ENABLED=
# 1 enables WhatsApp Cloud API (needs a Meta WhatsApp Business account and approved templates).
WHATSAPP_ENABLED=
WHATSAPP_TOKEN=
WHATSAPP_PHONE_ID=
```

- [ ] **Step 5: Run tests, gate, commit**

Run: `npm run build:packages && npx vitest run workers && npm run typecheck && npm run lint && npx prettier --check .`
Expected: PASS.

```bash
git add workers package.json package-lock.json scripts/dev.sh .env.example
git commit -m "feat(worker): notifier with SES, SNS, WhatsApp and console providers, delivery retries and reminder sweep"
```

---

### Task 8: Web: patients pages, phone reveal, no-show actions, notifications outbox, settings

**Files:**
- Create: `apps/web/src/app/(app)/app/patients/page.tsx`, `apps/web/src/app/(app)/app/patients/[id]/page.tsx`, `apps/web/src/app/(app)/app/notifications/page.tsx`
- Create: `apps/web/src/components/app/PatientsView.tsx`, `PatientDetailView.tsx`, `PatientForm.tsx`, `RevealPhone.tsx`, `NotificationsTable.tsx`, `NotificationsView.tsx`, `NotificationSettings.tsx`
- Modify: `apps/web/src/components/app/Sidebar.tsx` (NAV), `CallbacksQueue.tsx` (reveal button in `Row`), `AppointmentList.tsx` + `AppointmentsView.tsx` (outcome buttons), `Badge.tsx` (`NotificationStatusBadge`), `apps/web/src/lib/dashboard.ts` (`SKIP_TEXT`, `channelLabel`), `apps/web/src/app/(app)/app/settings/page.tsx` (Notifications section)
- Test: `apps/web/src/components/app/RevealPhone.test.tsx`, `NotificationsTable.test.tsx`, `PatientForm.test.tsx`, `NotificationSettings.test.tsx`, `Sidebar.test.tsx` (update), `AppointmentList.test.tsx` (add outcome case)

**Interfaces:**
- Consumes: Task 5 routes and Task 1 DTOs (`Patient`, `PatientDetail`, `Notification`, `NOTIFICATION_KIND_LABEL`, `SKIP_REASONS`, `clinicNotificationSettings`, `LANGUAGES`).
- Produces: pages `/app/patients`, `/app/patients/[id]`, `/app/notifications`; NAV order Overview, Appointments, Patients, Calls, Callbacks, Notifications, Assistant, Settings.

- [ ] **Step 1: Failing component tests**

`RevealPhone.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RevealPhone } from "./RevealPhone";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ useApi: () => api }));
afterEach(() => {
  cleanup();
  api.mockReset();
});

describe("RevealPhone", () => {
  it("shows the masked number until clicked, then a tel: link from the reveal endpoint", async () => {
    api.mockResolvedValue({ phone: "+919876543210" });
    render(<RevealPhone masked="+91 •••• ••3210" path="/v1/patients/pat_1/reveal-phone" />);
    expect(screen.getByText("+91 •••• ••3210")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /show number/i }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/v1/patients/pat_1/reveal-phone", { method: "POST" }));
    const link = (await screen.findByRole("link", { name: "+919876543210" })) as HTMLAnchorElement;
    expect(link.href).toBe("tel:+919876543210");
  });
  it("explains a purged callback", async () => {
    api.mockRejectedValue(Object.assign(new Error("callback contact details were purged"), { status: 409 }));
    render(<RevealPhone masked="+91 •••• ••0001" path="/v1/callbacks/cb_1/reveal-phone" />);
    fireEvent.click(screen.getByRole("button", { name: /show number/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/purged|no longer/i);
  });
});
```

`NotificationsTable.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Notification } from "@muxaris/shared";
import { NotificationsTable } from "./NotificationsTable";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ useApi: () => api }));
afterEach(() => {
  cleanup();
  api.mockReset();
});
const base: Notification = {
  id: "ntf_1", clinicId: "cl_1", patientId: "pat_1", appointmentId: "apt_1", channel: "email",
  template: "appointment_confirmed", language: "en-IN", toMasked: "r•••@x.com", status: "skipped",
  error: "no_contact", providerId: null, attempts: 0, nextAttemptAt: null,
  payload: { subject: "Appointment confirmed at Sunrise", body: "Namaste Ravi. …" },
  createdAt: "2026-10-05T05:00:00Z", sentAt: null,
};

describe("NotificationsTable", () => {
  it("renders kind, channel, masked recipient, status and a readable skip reason", () => {
    render(<NotificationsTable items={[base]} tz="Asia/Kolkata" onChanged={() => undefined} />);
    expect(screen.getByText("Confirmation")).toBeTruthy();
    expect(screen.getByText("r•••@x.com")).toBeTruthy();
    expect(screen.getByText("No email on file")).toBeTruthy();
  });
  it("retries failed and skipped rows through the API", async () => {
    const onChanged = vi.fn();
    api.mockResolvedValue({ notification: { ...base, status: "queued", error: null } });
    render(<NotificationsTable items={[base]} tz="Asia/Kolkata" onChanged={onChanged} />);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/v1/notifications/ntf_1/retry", { method: "POST" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ status: "queued" })));
  });
  it("shows no retry for sent rows and expands the message body", () => {
    render(<NotificationsTable items={[{ ...base, status: "sent", error: null }]} tz="Asia/Kolkata" onChanged={() => undefined} />);
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /view message/i }));
    expect(screen.getByText(/Namaste Ravi/)).toBeTruthy();
  });
});
```

`PatientForm.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PatientForm } from "./PatientForm";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ useApi: () => api }));
afterEach(() => {
  cleanup();
  api.mockReset();
});

describe("PatientForm", () => {
  it("creates a patient with phone, name, email and language", async () => {
    const onSaved = vi.fn();
    api.mockResolvedValue({ patient: { id: "pat_9" } });
    render(<PatientForm mode="create" onSaved={onSaved} onCancel={() => undefined} />);
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: "9876543210" } });
    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: "Ravi" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "r@x.com" } });
    fireEvent.change(screen.getByLabelText(/language/i), { target: { value: "kn-IN" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/v1/patients", {
        method: "POST",
        body: { phone: "9876543210", name: "Ravi", email: "r@x.com", preferredLanguage: "kn-IN" },
      }),
    );
    expect(onSaved).toHaveBeenCalledWith({ id: "pat_9" });
  });
  it("edits only changed fields and clears email with null", async () => {
    api.mockResolvedValue({ patient: { id: "pat_1" } });
    render(
      <PatientForm
        mode="edit"
        patientId="pat_1"
        initial={{ name: "Ravi", email: "r@x.com", preferredLanguage: "en-IN", dob: null, notes: null }}
        onSaved={() => undefined}
        onCancel={() => undefined}
      />,
    );
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/v1/patients/pat_1", { method: "PATCH", body: { email: null } }),
    );
  });
  it("surfaces a duplicate-phone error", async () => {
    api.mockRejectedValue(Object.assign(new Error("a patient with this phone already exists"), { status: 409 }));
    render(<PatientForm mode="create" onSaved={() => undefined} onCancel={() => undefined} />);
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: "9876543210" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/already exists/i);
  });
});
```

`NotificationSettings.test.tsx` (same shape as `RecordCallsToggle.test.tsx`): two switches "Send confirmations" and "Send reminders"; clicking the reminders switch PATCHes `/v1/clinics/cl_1` with `{ settings: { notifications: { reminders: false } } }`; non-owners see "Only the clinic owner can change this." and no switches.

`Sidebar.test.tsx`: update the expected NAV labels to `["Overview","Appointments","Patients","Calls","Callbacks","Notifications","Assistant","Settings"]`.

`AppointmentList.test.tsx`: add a case: with `now` later than `endsAt` of a `scheduled` appointment and `onOutcome` provided, buttons "Completed" and "No-show" render and clicking "No-show" calls `onOutcome(appointment, "no_show")`; a future appointment renders neither.

If `toHaveTextContent` is unavailable (no jest-dom in this repo), assert `.textContent` with a regex instead; check how `RecordCallsToggle.test.tsx` asserts.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run apps/web/src/components/app` → FAIL (missing components / NAV mismatch).

- [ ] **Step 3: Implement components**

`RevealPhone.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useApi } from "@/lib/api-client";
import { ghostBtn } from "./Modal";

const SHOW_MS = 60_000;

/** Masked phone with an audited "Show number" reveal that hides itself again after a minute. */
export function RevealPhone({ masked, path }: { masked: string; path: string }) {
  const api = useApi();
  const [phone, setPhone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!phone) return;
    const t = setTimeout(() => setPhone(null), SHOW_MS);
    return () => clearTimeout(t);
  }, [phone]);

  async function reveal() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ phone: string }>(path, { method: "POST" });
      setPhone(r.phone);
    } catch (e) {
      const status = (e as { status?: number }).status;
      setError(
        status === 409
          ? "This number was purged after 90 days and is no longer available."
          : e instanceof Error
            ? e.message
            : "Could not show the number",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {phone ? (
        <a href={`tel:${phone}`} className="font-medium tabular-nums underline">
          {phone}
        </a>
      ) : (
        <span className="font-medium tabular-nums">{masked}</span>
      )}
      {!phone ? (
        <button type="button" className={ghostBtn} disabled={busy} onClick={reveal}>
          Show number
        </button>
      ) : null}
      {error ? (
        <span role="alert" className="text-sm text-red-700">
          {error}
        </span>
      ) : null}
    </span>
  );
}
```

`dashboard.ts` additions:

```ts
export const CHANNEL_LABEL: Record<Notification["channel"], string> = {
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
};
/** Human text for a notification's error column. */
export function notificationErrorText(n: Pick<Notification, "status" | "error">): string {
  if (!n.error) return "";
  if (n.error in SKIP_REASONS) return SKIP_REASONS[n.error as SkipReason];
  return n.status === "failed" ? `Failed: ${n.error}` : `Retrying after: ${n.error}`;
}
```

`Badge.tsx`: add `NotificationStatusBadge({ status })` mapping queued → muted "Queued", sent → ok "Sent", failed → warn "Failed", skipped → muted "Not sent" (use the file's existing `Tone` names).

`NotificationsTable.tsx`: client component, props `{ items: Notification[]; tz: string; onChanged: (n: Notification) => void; showPatientLink?: boolean }`. Renders a `<table>` (or stacked cards under `sm:`) with columns Time (`formatDateTime(createdAt, tz)`), Type (`NOTIFICATION_KIND_LABEL[template]`), Channel (`CHANNEL_LABEL`), To (`toMasked` or "—"), Status (`NotificationStatusBadge`), Details (`notificationErrorText`), and an actions cell with "View message" (toggles a row below showing `payload.subject` in bold and `payload.body`) and, for `failed`/`skipped` rows, "Retry" → `api(`/v1/notifications/${id}/retry`, { method: "POST" })` then `onChanged(r.notification)`; errors in a `role="alert"` under the row. Empty list → `<EmptyState>No messages yet. Confirmations appear here when an appointment is booked.</EmptyState>`.

`NotificationsView.tsx`: client; props `{ initial: Notification[]; initialTotal: number; tz: string }`; tabs All / Queued / Sent / Failed / Not sent (status filter via `/v1/notifications?status=…&limit=50&offset=`), "Load more", uses `NotificationsTable`, replaces an item in place on `onChanged`. Follow `CallbacksQueue.tsx`'s tab/bucket structure.

`PatientForm.tsx`: client; props `{ mode: "create"; onSaved: (p: { id: string }) => void; onCancel: () => void } | { mode: "edit"; patientId: string; initial: Pick<Patient,"name"|"email"|"preferredLanguage"|"dob"|"notes">; onSaved; onCancel }`. Fields with `<label htmlFor>`: Phone (create only, required, `inputMode="tel"`), Name, Email (`type="email"`), Language (`<select>` from `LANGUAGES`), Date of birth (`type="date"`), Notes (`textarea`). On save: create → POST `/v1/patients` with only non-empty fields; edit → PATCH with only changed fields, empty email/name/notes/dob as `null`; disable the button while busy; show `error.message` in `role="alert"`; `primaryBtn`/`ghostBtn`/`fieldClass` from `Modal`.

`PatientsView.tsx`: client; props `{ initial: Patient[]; initialTotal: number; tz: string }`; search input (label "Search patients", debounced 300 ms, updates `?q=` in the URL via `useRouter().replace` and refetches `/v1/patients?q=&limit=50`), "Add patient" button opening `<Modal>` with `PatientForm mode="create"` (on save `router.push(`/app/patients/${id}`)`), table: Name (link to detail; "Unnamed" when null), Phone (`phoneMasked`), Language label, Email (or "—"), Added (`formatDay`). "Load more" with offset. Empty → `<EmptyState>No patients yet. They are added automatically when the assistant books an appointment.</EmptyState>`.

`PatientDetailView.tsx`: client; props `{ detail: PatientDetail; doctors: Pick<Doctor,"id"|"name">[]; services: Pick<Service,"id"|"name">[]; notifications: Notification[]; tz: string }`. Header: name (or "Unnamed patient"), `<RevealPhone masked={patient.phoneMasked} path={`/v1/patients/${id}/reveal-phone`} />`, language badge, "Edit" toggling `PatientForm mode="edit"` inline (on save: `router.refresh()`). Sections: "Visits" (appointments newest first: `formatDateTime(startsAt)`, doctor name, service name, `<AppointmentStatusBadge>`; empty text "No visits yet."), "Calls" (link `/app/calls/${id}`, `formatDateTime(startedAt)`, `<OutcomeBadge>`, summary or "No summary"), "Messages" (`<NotificationsTable items={notifications} …>`).

`NotificationSettings.tsx`: copy `RecordCallsToggle.tsx`'s structure; props `{ clinicId; initial: { confirmations: boolean; reminders: boolean }; isOwner }`; two `role="switch"` buttons labelled "Send confirmations" (help "Email the patient when an appointment is booked, moved or cancelled. Only patients with an email on file receive messages.") and "Send reminders" (help "Email a reminder the day before and two hours before the visit."); each PATCH sends only its own key; state resyncs from `clinicNotificationSettings(r.clinic.settings)`.

- [ ] **Step 4: Pages, NAV, settings, callbacks, appointments**

`patients/page.tsx`:

```tsx
import type { Clinic, Patient } from "@muxaris/shared";
import { requireActiveClinic, serverApi } from "@/lib/api-server";
import { PatientsView } from "@/components/app/PatientsView";

export const dynamic = "force-dynamic";

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const active = await requireActiveClinic();
  const { q } = await searchParams;
  const qs = q ? `&q=${encodeURIComponent(q)}` : "";
  const [{ clinic }, list] = await Promise.all([
    serverApi<{ clinic: Clinic }>(`/v1/clinics/${active.clinicId}`),
    serverApi<{ patients: Patient[]; total: number }>(`/v1/patients?limit=50${qs}`),
  ]);
  return (
    <div className="max-w-5xl px-4 py-8 sm:px-8">
      <h1 className="font-display mb-6 text-3xl">Patients</h1>
      <PatientsView key={`${active.clinicId}:${q ?? ""}`} initial={list.patients} initialTotal={list.total} tz={clinic.timezone} />
    </div>
  );
}
```

`patients/[id]/page.tsx`: `params: Promise<{ id: string }>`; fetch `/v1/patients/${id}` (404 → `notFound()` from `next/navigation`, mirroring `calls/[id]/page.tsx`), `/v1/doctors`, `/v1/services`, `/v1/notifications?patientId=${id}&limit=50`, clinic; render `<PatientDetailView>` with a "← Patients" link.

`notifications/page.tsx`: like `callbacks/page.tsx`, fetching `/v1/notifications?limit=50` and rendering `<NotificationsView>` under an `<h1>` "Notifications" and a one-line note: "Confirmations and reminders go by email to patients with an email on file. SMS and WhatsApp are coming soon."

`Sidebar.tsx` NAV: insert `{ href: "/app/patients", label: "Patients", match: (p) => p.startsWith("/app/patients") }` after Appointments and `{ href: "/app/notifications", label: "Notifications", match: (p) => p.startsWith("/app/notifications") }` after Callbacks.

`settings/page.tsx`: add after the Assistant section:

```tsx
        <Section title="Notifications">
          <NotificationSettings
            clinicId={clinic.id}
            initial={clinicNotificationSettings(clinic.settings)}
            isOwner={role === "owner"}
          />
        </Section>
```

`CallbacksQueue.tsx` `Row`: replace `<span className="font-medium tabular-nums">{cb.phoneMasked}</span>` with `<RevealPhone masked={cb.phoneMasked} path={`/v1/callbacks/${encodeURIComponent(cb.id)}/reveal-phone`} />`.

`AppointmentList.tsx`: add props `onOutcome?: (a: Appointment, status: "completed" | "no_show") => void; now?: Date`. For each row where `ACTIVE.includes(a.status)` and `new Date(a.endsAt) < (now ?? new Date())` and `onOutcome` is set, render two `ghostBtn` buttons "Completed" and "No-show" instead of Reschedule/Cancel. `AppointmentsView.tsx`: pass `onOutcome` that POSTs `/v1/appointments/${id}/status` with `{ status }` and replaces the row from `r.appointment`, surfacing errors the way cancel does.

- [ ] **Step 5: Run tests, build, gate, commit**

Run: `npx vitest run apps/web && npm run typecheck && npm run lint && npx prettier --check .` then `set -a; source .env; set +a; npm run build -w @muxaris/web` (never print the env).
Expected: PASS, build succeeds with the three new routes listed.

```bash
git add apps/web
git commit -m "feat(web): patients, audited phone reveal, no-show marking, notifications outbox and settings"
```

---

### Task 9: Copy, privacy page, copy guard, docs, e2e assertion

**Files:**
- Modify: `apps/web/src/lib/content.ts`, `apps/web/src/app/privacy/page.tsx`, `apps/web/src/lib/copy-guard.test.ts`, `README.md`, `docs/ARCHITECTURE.md`, `scripts/e2e-voice.ts`

- [ ] **Step 1: Update the copy guard first (failing)**

In `copy-guard.test.ts` BANNED: remove `email confirmations\b(?! \(coming soon\))`, `sent by email`, `confirmation is sent` and `Confirmation sent`; add `SMS reminders|WhatsApp reminders|text message reminder|instant confirmation|WhatsApp confirmations(?! .*coming)|SMS confirmations`. Add to the required-phrase test: `lib/content.ts` must contain "email on file"; `app/privacy/page.tsx` must contain "appointment confirmations and reminders by email" and "Amazon Simple Email Service". Run `npx vitest run apps/web/src/lib/copy-guard.test.ts` → FAIL (required phrases missing).

- [ ] **Step 2: Copy**

`content.ts`:
- `HERO.note` → `"Browser calls today; clinic phone numbers and WhatsApp confirmations coming soon."`
- step 03 `text` → `"Bookings appear on your dashboard the moment they are made, with the call and transcript beside them. Patients with an email on file get a confirmation and reminders."`
- both pricing features `"Email confirmations (coming soon)"` → `"Email confirmations and reminders"`
- `COMING_NEXT` unchanged.

`privacy/page.tsx`:
- Data collected: add `<li><strong>Contact details for messages.</strong> An email address, if the clinic records one, used for appointment confirmations and reminders.</li>`
- How we use it: append "…and fixing faults, and sending appointment confirmations and reminders by email to patients whose email the clinic has recorded."
- Service providers, AWS bullet: "…for hosting, storage, authentication, Amazon Simple Email Service for appointment emails, and the Amazon Bedrock language models that power the assistant."
- Retention: append "Appointment messages are kept with the booking record. Callback requests lose their contact number 90 days after they are closed."

- [ ] **Step 3: Docs**

`docs/ARCHITECTURE.md`: add a `## Notifications` section after "Call pipeline" covering: outbox row written in the booking transaction (rendered subject/body, channel chosen email → WhatsApp → SMS by flags, `skipped/no_contact` when nothing), the claim loop (`FOR UPDATE SKIP LOCKED`, `attempts`, `next_attempt_at`, 5 attempts, 5-minute retry), providers and env keys, reminder windows (20–24 h and 1–2 h, stamps written with the row, reschedule re-arms), clinic switches, retry from the UI, callback purge at 90 days, and the audited reveal endpoints. Under `## Phase 5 IAM` add: notifier Lambda needs `ses:SendEmail`/`ses:SendRawEmail` on the `muxaris.com` identity, `sns:Publish` only when `SMS_ENABLED`, and EventBridge schedules: `deliverHandler` rate(1 minute), `remindersHandler` rate(15 minutes), post-call `sweepHandler` rate(15 minutes). Fix the parked wording: tool turns are stamped "at the start of the tool call", not "at the start of the call". `README.md`: list the new env keys, the notifier in the dev stack, how to see messages locally (the Notifications page; the console provider logs counts only), SES verification steps (deploy `MuxarisNotify`, add the three DKIM CNAMEs at GoDaddy, request production access), and the SMS (DLT) and WhatsApp (template approval) caveats.

- [ ] **Step 4: e2e assertion**

In `scripts/e2e-voice.ts`, after the booking is verified, GET `/v1/notifications?appointmentId=<id>` and assert exactly one row with `template === "appointment_confirmed"` and `status === "skipped"` with `error === "no_contact"` (the assistant books without an email). Print only the status and kind.

- [ ] **Step 5: Gate and commit**

Run: `npx vitest run apps/web/src/lib && npm run typecheck && npm run lint && npx prettier --check .`

```bash
git add apps/web/src/lib/content.ts apps/web/src/app/privacy/page.tsx apps/web/src/lib/copy-guard.test.ts README.md docs/ARCHITECTURE.md scripts/e2e-voice.ts
git commit -m "docs,copy: email confirmations and reminders are live for patients with an email on file"
```

---

### Task 10: Infra: SES domain identity stack

**Files:**
- Create: `infra/lib/notify-stack.ts`, `infra/test/notify-stack.test.ts`
- Modify: `infra/bin/muxaris.ts`, `infra/package.json` (`deploy:notify`)

- [ ] **Step 1: Failing test**

```ts
import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { describe, it } from "vitest";
import { ENV } from "../lib/config.js";
import { NotifyStack } from "../lib/notify-stack.js";

describe("NotifyStack", () => {
  const t = Template.fromStack(new NotifyStack(new App(), "T", { env: ENV }));
  it("verifies muxaris.com with DKIM and a custom MAIL FROM", () => {
    t.hasResourceProperties("AWS::SES::EmailIdentity", {
      EmailIdentity: "muxaris.com",
      DkimAttributes: { SigningEnabled: true },
      MailFromAttributes: { MailFromDomain: "mail.muxaris.com" },
    });
  });
  it("outputs the three DKIM CNAMEs for GoDaddy", () => {
    const outputs = t.findOutputs("*");
    const names = Object.keys(outputs);
    for (const n of ["DkimName1", "DkimValue1", "DkimName2", "DkimValue2", "DkimName3", "DkimValue3"])
      if (!names.includes(n)) throw new Error(`missing output ${n}`);
  });
});
```

- [ ] **Step 2: Implement**

```ts
import { CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
import * as ses from "aws-cdk-lib/aws-ses";
import type { Construct } from "constructs";
import { DOMAIN } from "./config.js";

/** SES domain identity for appointment email. DNS lives at GoDaddy: add the outputs by hand. */
export class NotifyStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);
    const identity = new ses.EmailIdentity(this, "Domain", {
      identity: ses.Identity.domain(DOMAIN),
      mailFromDomain: `mail.${DOMAIN}`,
    });
    identity.dkimRecords.forEach((r, i) => {
      new CfnOutput(this, `DkimName${i + 1}`, { value: r.name });
      new CfnOutput(this, `DkimValue${i + 1}`, { value: r.value });
    });
    new CfnOutput(this, "MailFromMx", { value: `10 feedback-smtp.${this.region}.amazonses.com` });
    new CfnOutput(this, "MailFromTxt", { value: "v=spf1 include:amazonses.com ~all" });
  }
}
```

`bin/muxaris.ts`: `new NotifyStack(app, "MuxarisNotify", { env: ENV, description: "Muxaris: SES domain identity for appointment email" });`. `infra/package.json`: `"deploy:notify": "bash scripts/cdk.sh deploy MuxarisNotify --require-approval never"`.

- [ ] **Step 3: Test, synth, deploy, commit**

Run: `npx vitest run infra && npm run synth -w @muxaris/infra` (guarded; secondary account only). Then `npm run deploy:notify -w @muxaris/infra`. Record the six DKIM outputs plus MailFrom outputs in the task report verbatim (they are public DNS values, not secrets). Commit:

```bash
git add infra
git commit -m "infra: SES domain identity stack for appointment email"
```

---

## Self-review notes (controller)

- Spec coverage: patients CRUD (T2, T5, T8), auto-create from calls (T6), language preference (T2 field + T8 form), visit history (T2 `getPatient`, T8), no-show (T2, T5, T8); notification service + providers (T4, T7), outbox UI (T8), templates in 5 languages (T3); reminder worker + settings (T4, T7, T8); carry-overs: audited reveal (T2, T5, T8), callback retention (T2, T7).
- Deviation from spec, ruled: the notifier consumes the `notifications` table on a schedule instead of a second SQS queue (the outbox row is already the durable job; a queue would need a stale-row sweep anyway). The Phase 5 Workers stack gets EventBridge rules instead of a notifications queue. The reminders Lambda lives in the same `workers/notifier` package as a second handler.
- Post-call worker no longer needs to "enqueue confirmation notification" (spec 152): confirmations are written at booking time in the same transaction, which is earlier and cannot be lost.
- Type consistency checked: `ChannelFlags`, `NotificationKind`, `SkipReason`, `PatientView`/`Patient`, `NotificationView`/`Notification`, `notify?: ChannelFlags`, `setAppointmentOutcome`, `revealPatientPhone`/`revealCallbackPhone`, `deliverOnce`, `buildProviders` are named identically across tasks.
