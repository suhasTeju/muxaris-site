# Phase 0: Foundation and Spikes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Astro landing site with an npm-workspaces monorepo that has the shared data contract, a running Postgres with the demo clinic seeded, the AWS account guard plus a deployed Cognito user pool, scaffolds for the three runtime apps, and verified spikes for Sarvam STT/TTS and Bedrock tool calling.

**Architecture:** One repo, npm workspaces. `packages/shared` holds constants, Zod schemas and the assistant tool definitions every app imports. `packages/db` holds the Drizzle schema, migrations and the demo seed. `apps/web` (Next.js 16, Netlify), `apps/api` (Hono, Fargate) and `apps/voice-gateway` (ws, Fargate) are scaffolded with health endpoints and Dockerfiles only. `infra` is a CDK v2 TypeScript app whose first stack is `MuxarisAuth` (Cognito). `scripts/` hold the AWS guard, bootstrap, dev runner and spikes.

**Tech Stack:** Node 22, npm 10 workspaces, TypeScript 5, Vitest, ESLint 9 flat config + Prettier, Next.js 16 + React 19 + Tailwind v4, Hono 4 + `@hono/node-server`, `ws`, Drizzle ORM + `pg` + drizzle-kit, AWS CDK v2 (`aws-cdk-lib`), `@aws-sdk/client-bedrock-runtime`, `tsx` for scripts, Docker Compose (Postgres 16).

**Spec:** `docs/superpowers/specs/2026-10-04-muxaris-platform-design.md`

## Global Constraints

- **AWS account**: only profile `aws-secondary-account`, account `005533348545`, region `ap-south-1`. Every script sources `scripts/lib/aws-guard.sh`. CDK `env` is pinned to `{ account: "005533348545", region: "ap-south-1" }`. Never run `aws` without `--profile aws-secondary-account` or `AWS_PROFILE` set to it.
- **Package manager**: npm only (pnpm is broken on this machine). No `pnpm-lock.yaml`, no `yarn.lock`.
- **Branch**: all work on `feat/platform`. Do not push to `main` (it deploys to Netlify).
- **Secrets**: read from `.env` at repo root (gitignored). Variable names: `SARVAM_TTS_API_KEY` (serves STT, TTS and chat), `GPT_IMAGE_ENDPOINT`, `GPT_IMAGE_API_KEY`. Never print values; never commit `.env`.
- **Brand**: product name is **Muxaris**, domain **muxaris.com**. Visual system: Fraunces (display) + Inter (body), paper `#fafaf7`, ink `#0c1220`, green accent `#16a34a`.
- **Languages**: `en-IN`, `hi-IN`, `kn-IN`, `ta-IN`, `te-IN` (BCP-47 with region, as Sarvam requires).
- **TypeScript**: `strict: true`, ESM (`"type": "module"`) in every workspace except where Next.js dictates otherwise.
- **Commits**: conventional prefix (`feat:`, `chore:`, `test:`, `docs:`), trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. **A command run against the wrong AWS account.** Expected: every script aborts before any API call when the caller account is not 005533348545. Pinned by Task 5's guard test (`AWS_PROFILE=default scripts/lib/aws-guard.sh` must exit 1).
2. **Seed run twice.** Expected: idempotent; the demo clinic exists once, no duplicate doctors. Pinned by Task 4 seed test.
3. **Postgres port collision with another local Postgres.** Expected: compose uses port 5433 and `DATABASE_URL` matches. Pinned by Task 1 (`docker compose config` shows 5433).
4. **Missing `.env` on a fresh machine.** Expected: `npm run dev` for the API/gateway starts with mocks and a clear log line, not a stack trace. Pinned by Task 8's env loader test (missing key → `provider: "mock"`).
5. **Sarvam returns 429/403.** Expected: spikes print the HTTP status and body in a single line and exit non-zero; they do not retry forever. Pinned by Task 6 (error path asserted manually with a bogus key).

---

### Task 1: Reset the repo into an npm-workspaces monorepo

**Files:**
- Delete: `src/`, `astro.config.mjs`, `public/favicon.svg`, `dist/` (ignored), `.astro/` (ignored), `package-lock.json`
- Modify: `package.json`, `.gitignore`, `netlify.toml`, `README.md`
- Create: `tsconfig.base.json`, `eslint.config.js`, `.prettierrc`, `.prettierignore`, `vitest.workspace.ts`, `docker-compose.yml`, `.env.example`, `.nvmrc`, `apps/.gitkeep`, `packages/.gitkeep`, `workers/.gitkeep`

**Interfaces:**
- Produces: root scripts `npm run build|lint|typecheck|test|format`, `npm run db:up|db:down`; `DATABASE_URL=postgres://muxaris:muxaris@localhost:5433/muxaris`.

- [ ] **Step 1: Remove the Astro site**

```bash
cd /Users/suhas/Documents/muxaris
git rm -rq src astro.config.mjs public/favicon.svg package-lock.json
rm -rf dist .astro node_modules
```

- [ ] **Step 2: Write the root `package.json`**

```json
{
  "name": "muxaris",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22 <23", "npm": ">=10" },
  "workspaces": ["apps/*", "packages/*", "workers/*", "infra"],
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:up": "docker compose up -d postgres",
    "db:down": "docker compose down",
    "db:generate": "npm run generate -w @muxaris/db",
    "db:migrate": "npm run migrate -w @muxaris/db",
    "db:seed": "npm run seed -w @muxaris/db",
    "dev": "bash scripts/dev.sh"
  },
  "devDependencies": {
    "@eslint/js": "^9",
    "@types/node": "^22",
    "eslint": "^9",
    "eslint-config-prettier": "^10",
    "globals": "^16",
    "prettier": "^3",
    "tsx": "^4",
    "typescript": "^5.9",
    "typescript-eslint": "^8",
    "vitest": "^3"
  }
}
```

- [ ] **Step 3: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2023"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 4: Write `eslint.config.js`, `.prettierrc`, `.prettierignore`, `vitest.workspace.ts`, `.nvmrc`**

```js
// eslint.config.js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/.next/**", "**/cdk.out/**", "**/node_modules/**", "**/*.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  { rules: { "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }] } },
  prettier,
);
```

```json
// .prettierrc
{ "printWidth": 100, "singleQuote": false, "trailingComma": "all", "semi": true }
```

```
# .prettierignore
dist
.next
cdk.out
node_modules
package-lock.json
*.md
```

```ts
// vitest.workspace.ts
export default ["apps/*/vitest.config.ts", "packages/*/vitest.config.ts", "workers/*/vitest.config.ts", "infra/vitest.config.ts"];
```

`.nvmrc` contains `22`.

- [ ] **Step 5: Write `docker-compose.yml` and `.env.example`**

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    container_name: muxaris-postgres
    environment:
      POSTGRES_USER: muxaris
      POSTGRES_PASSWORD: muxaris
      POSTGRES_DB: muxaris
    ports:
      - "5433:5432"
    volumes:
      - muxaris-pg:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U muxaris"]
      interval: 5s
      timeout: 3s
      retries: 10
volumes:
  muxaris-pg:
```

```bash
# .env.example — copy to .env and fill in. Never commit .env.
AWS_PROFILE=aws-secondary-account
AWS_REGION=ap-south-1
DATABASE_URL=postgres://muxaris:muxaris@localhost:5433/muxaris

# Sarvam AI (one key serves STT, TTS and chat)
SARVAM_TTS_API_KEY=

# Azure OpenAI gpt-image-2 (asset generation only)
GPT_IMAGE_ENDPOINT=
GPT_IMAGE_API_KEY=

# Cognito (printed by scripts/bootstrap-aws.sh after the Auth stack deploys)
NEXT_PUBLIC_COGNITO_USER_POOL_ID=
NEXT_PUBLIC_COGNITO_CLIENT_ID=
NEXT_PUBLIC_COGNITO_DOMAIN=
COGNITO_USER_POOL_ID=
COGNITO_CLIENT_ID=

# Optional: Google federation for Cognito
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=

# Local URLs
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_VOICE_WS_URL=ws://localhost:4100
API_PORT=4000
VOICE_PORT=4100
```

- [ ] **Step 6: Update `.gitignore`**

```
node_modules
dist
.next
out
cdk.out
coverage
.env
.env.*
!.env.example
.DS_Store
*.log
.turbo
scripts/spike/out
```

- [ ] **Step 7: Rewrite `netlify.toml` for the Next.js app**

```toml
[build]
  base = "apps/web"
  command = "npm run build"
  publish = ".next"

[build.environment]
  NODE_VERSION = "22"
  NPM_FLAGS = "--workspaces --include-workspace-root"

[[plugins]]
  package = "@netlify/plugin-nextjs"

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
```

- [ ] **Step 8: Replace `README.md` with a short monorepo README**

Content: one paragraph (Muxaris, AI voice receptionist for Indian dental clinics), a "Layout" table of the workspaces from the spec, "Local setup" (`cp .env.example .env`, `npm install`, `npm run db:up`, `npm run db:migrate && npm run db:seed`, `npm run dev`), "AWS" (one line: only `aws-secondary-account`, see `scripts/lib/aws-guard.sh`), link to the spec and plans.

- [ ] **Step 9: Install and verify**

Run: `npm install && npx prettier --check . && npm run lint && docker compose config | grep -n '5433'`
Expected: install succeeds, prettier/lint pass on the (empty) tree, compose shows `"5433:5432"`.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: reset repo into npm-workspaces monorepo

Removes the Astro landing site. Adds root tooling (TypeScript, ESLint,
Prettier, Vitest), Postgres compose on port 5433, .env.example and a
Netlify config for apps/web.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `packages/shared` — constants, schemas and assistant tool definitions

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/vitest.config.ts`, `packages/shared/src/index.ts`, `packages/shared/src/languages.ts`, `packages/shared/src/clinic.ts`, `packages/shared/src/tools.ts`, `packages/shared/src/tools.test.ts`

**Interfaces:**
- Produces: `LANGUAGES` (array of `{ code: LanguageCode; label; native; sarvamSpeaker }`), `LanguageCode = "en-IN"|"hi-IN"|"kn-IN"|"ta-IN"|"te-IN"`, `SPECIALTIES`, `CITIES`, `WEEKDAYS`, `ASSISTANT_TOOLS: ToolDefinition[]`, `ToolName` union, Zod input schemas per tool exported as `toolInputSchemas`.

- [ ] **Step 1: Package files**

```json
// packages/shared/package.json
{
  "name": "@muxaris/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "scripts": { "build": "tsc -p tsconfig.json", "typecheck": "tsc -p tsconfig.json --noEmit", "test": "vitest run" },
  "dependencies": { "zod": "^4" },
  "devDependencies": { "typescript": "^5.9", "vitest": "^3" }
}
```

```json
// packages/shared/tsconfig.json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "outDir": "dist", "rootDir": "src" }, "include": ["src"], "exclude": ["src/**/*.test.ts"] }
```

```ts
// packages/shared/vitest.config.ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["src/**/*.test.ts"] } });
```

- [ ] **Step 2: Write the failing test for tool definitions**

```ts
// packages/shared/src/tools.test.ts
import { describe, expect, it } from "vitest";
import { ASSISTANT_TOOLS, toolInputSchemas } from "./tools.js";

describe("assistant tools", () => {
  it("defines the nine receptionist tools with snake_case names", () => {
    const names = ASSISTANT_TOOLS.map((t) => t.name);
    expect(names).toEqual([
      "get_clinic_info",
      "find_slots",
      "book_appointment",
      "reschedule_appointment",
      "cancel_appointment",
      "lookup_patient",
      "request_callback",
      "transfer_to_staff",
      "end_call",
    ]);
    for (const n of names) expect(n).toMatch(/^[a-z_]+$/);
  });

  it("validates book_appointment input", () => {
    const ok = toolInputSchemas.book_appointment.safeParse({
      patient_name: "Asha",
      patient_phone: "+919876543210",
      doctor_id: "doc_1",
      service_id: "svc_1",
      starts_at: "2026-10-05T11:00:00+05:30",
    });
    expect(ok.success).toBe(true);
    const bad = toolInputSchemas.book_appointment.safeParse({ patient_name: "Asha" });
    expect(bad.success).toBe(false);
  });

  it("exposes JSON schema usable by Bedrock toolSpec", () => {
    const t = ASSISTANT_TOOLS.find((x) => x.name === "find_slots")!;
    expect(t.inputSchema.type).toBe("object");
    expect(Object.keys(t.inputSchema.properties ?? {})).toContain("date");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -w @muxaris/shared`
Expected: FAIL (module `./tools.js` not found).

- [ ] **Step 4: Implement constants and tools**

```ts
// packages/shared/src/languages.ts
export const LANGUAGE_CODES = ["en-IN", "hi-IN", "kn-IN", "ta-IN", "te-IN"] as const;
export type LanguageCode = (typeof LANGUAGE_CODES)[number];

export const LANGUAGES: ReadonlyArray<{
  code: LanguageCode;
  label: string;
  native: string;
  sarvamSpeaker: string; // default bulbul:v3 speaker for this language
}> = [
  { code: "en-IN", label: "English", native: "English", sarvamSpeaker: "anushka" },
  { code: "hi-IN", label: "Hindi", native: "हिन्दी", sarvamSpeaker: "anushka" },
  { code: "kn-IN", label: "Kannada", native: "ಕನ್ನಡ", sarvamSpeaker: "anushka" },
  { code: "ta-IN", label: "Tamil", native: "தமிழ்", sarvamSpeaker: "anushka" },
  { code: "te-IN", label: "Telugu", native: "తెలుగు", sarvamSpeaker: "anushka" },
];
export const LANGUAGE_LIST = "Kannada, Hindi, Tamil, Telugu, and English";
```

```ts
// packages/shared/src/clinic.ts
export const SPECIALTIES = ["dental", "skin_hair", "eye", "physiotherapy", "diagnostics", "other"] as const;
export type Specialty = (typeof SPECIALTIES)[number];
export const SPECIALTY_LABELS: Record<Specialty, string> = {
  dental: "Dental clinic", skin_hair: "Skin and hair clinic", eye: "Eye clinic",
  physiotherapy: "Physiotherapy", diagnostics: "Diagnostic centre", other: "Other",
};
export const CITIES = ["Bengaluru", "Mysuru", "Hubballi", "Chennai", "Hyderabad", "Other"] as const;
export const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export const DEFAULT_TIMEZONE = "Asia/Kolkata";
export const ROLES = ["owner", "front_desk"] as const;
export type Role = (typeof ROLES)[number];
```

```ts
// packages/shared/src/tools.ts
import { z } from "zod";

const phone = z.string().regex(/^\+91\d{10}$/, "E.164 Indian mobile, e.g. +919876543210");
const isoDateTime = z.string().datetime({ offset: true });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const toolInputSchemas = {
  get_clinic_info: z.object({}),
  find_slots: z.object({
    date: isoDate.describe("Calendar date in the clinic timezone, YYYY-MM-DD"),
    service_id: z.string().optional(),
    doctor_id: z.string().optional(),
    part_of_day: z.enum(["morning", "afternoon", "evening"]).optional(),
  }),
  book_appointment: z.object({
    patient_name: z.string().min(1),
    patient_phone: phone,
    doctor_id: z.string(),
    service_id: z.string(),
    starts_at: isoDateTime,
    notes: z.string().max(500).optional(),
  }),
  reschedule_appointment: z.object({
    appointment_id: z.string(),
    new_starts_at: isoDateTime,
  }),
  cancel_appointment: z.object({ appointment_id: z.string(), reason: z.string().max(300).optional() }),
  lookup_patient: z.object({ patient_phone: phone }),
  request_callback: z.object({
    patient_name: z.string().optional(),
    patient_phone: phone,
    reason: z.string().min(1).max(300),
    priority: z.enum(["normal", "urgent"]).default("normal"),
  }),
  transfer_to_staff: z.object({ reason: z.enum(["emergency", "clinical_question", "billing", "caller_request", "not_understood"]) }),
  end_call: z.object({ summary: z.string().max(300) }),
} as const;

export type ToolName = keyof typeof toolInputSchemas;
export type ToolInput<N extends ToolName> = z.infer<(typeof toolInputSchemas)[N]>;

export interface ToolDefinition {
  name: ToolName;
  description: string;
  inputSchema: Record<string, unknown> & { type: "object"; properties?: Record<string, unknown> };
}

const descriptions: Record<ToolName, string> = {
  get_clinic_info: "Get the clinic's address, opening hours, doctors and services. Call once at most.",
  find_slots: "Find available appointment slots on a date, optionally for a doctor, service or part of day. Always call before offering times.",
  book_appointment: "Book an appointment after the caller confirms the exact time. Requires the caller's name and 10-digit mobile number.",
  reschedule_appointment: "Move an existing appointment to a new confirmed time.",
  cancel_appointment: "Cancel an existing appointment after the caller confirms.",
  lookup_patient: "Find a patient's upcoming appointments by their mobile number.",
  request_callback: "Record that clinic staff should call the patient back, with the reason.",
  transfer_to_staff: "Hand the call to a human for emergencies, clinical questions, billing disputes or when the caller asks.",
  end_call: "End the call politely once the caller's needs are met. Include a one-line summary.",
};

export const ASSISTANT_TOOLS: ToolDefinition[] = (Object.keys(toolInputSchemas) as ToolName[]).map((name) => ({
  name,
  description: descriptions[name],
  inputSchema: z.toJSONSchema(toolInputSchemas[name]) as ToolDefinition["inputSchema"],
}));
```

```ts
// packages/shared/src/index.ts
export * from "./languages.js";
export * from "./clinic.js";
export * from "./tools.js";
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npm install && npm test -w @muxaris/shared && npm run typecheck -w @muxaris/shared && npm run build -w @muxaris/shared`
Expected: 3 tests pass; `dist/` emitted.

- [ ] **Step 6: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): languages, clinic constants and assistant tool schemas

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `packages/db` — Drizzle schema and first migration

**Files:**
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/drizzle.config.ts`, `packages/db/src/index.ts`, `packages/db/src/client.ts`, `packages/db/src/schema/index.ts`, `packages/db/src/schema/tenancy.ts`, `packages/db/src/schema/scheduling.ts`, `packages/db/src/schema/patients.ts`, `packages/db/src/schema/calls.ts`, `packages/db/src/schema/messaging.ts`, `packages/db/src/schema/billing.ts`, `packages/db/src/schema/misc.ts`, `packages/db/src/ids.ts`, `packages/db/drizzle/0000_init.sql` (generated)

**Interfaces:**
- Produces: `createDb(url: string): Db` (`Db = NodePgDatabase<typeof schema>`), `schema.*` tables, `newId(prefix)` → `"cl_…"`, `"doc_…"` etc. Column names are snake_case in Postgres, camelCase in TS.

- [ ] **Step 1: Package files**

```json
// packages/db/package.json
{
  "name": "@muxaris/db",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" }, "./schema": { "types": "./dist/schema/index.d.ts", "import": "./dist/schema/index.js" } },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "generate": "drizzle-kit generate",
    "migrate": "tsx src/migrate.ts",
    "seed": "tsx src/seed.ts",
    "test": "vitest run"
  },
  "dependencies": { "@muxaris/shared": "*", "drizzle-orm": "^0.44", "pg": "^8", "nanoid": "^5" },
  "devDependencies": { "@types/pg": "^8", "drizzle-kit": "^0.31", "tsx": "^4", "typescript": "^5.9", "vitest": "^3" }
}
```

```ts
// packages/db/drizzle.config.ts
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://muxaris:muxaris@localhost:5433/muxaris" },
});
```

```ts
// packages/db/src/ids.ts
import { customAlphabet } from "nanoid";
const nano = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 16);
export type IdPrefix = "cl" | "usr" | "mem" | "inv" | "doc" | "svc" | "pat" | "apt" | "ast" | "call" | "turn" | "cb" | "ntf" | "dr" | "aud";
export const newId = (prefix: IdPrefix) => `${prefix}_${nano()}`;
```

- [ ] **Step 2: Schema — tenancy**

```ts
// packages/db/src/schema/tenancy.ts
import { pgTable, text, timestamp, jsonb, pgEnum, uniqueIndex, index } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["owner", "front_desk"]);
export const planEnum = pgEnum("plan", ["pilot", "standard"]);
export const membershipStatusEnum = pgEnum("membership_status", ["active", "invited", "removed"]);

export const clinics = pgTable("clinics", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  specialty: text("specialty").notNull().default("dental"),
  city: text("city").notNull(),
  address: text("address"),
  phone: text("phone"),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  languages: text("languages").array().notNull().default(["en-IN"]),
  plan: planEnum("plan").notNull().default("pilot"),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  onboardingStep: text("onboarding_step").notNull().default("basics"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  cognitoSub: text("cognito_sub").notNull().unique(),
  email: text("email").notNull(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("users_email_idx").on(t.email)]);

export const memberships = pgTable("memberships", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  clinicId: text("clinic_id").notNull().references(() => clinics.id, { onDelete: "cascade" }),
  role: roleEnum("role").notNull(),
  status: membershipStatusEnum("status").notNull().default("active"),
  invitedBy: text("invited_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("memberships_user_clinic_idx").on(t.userId, t.clinicId), index("memberships_clinic_idx").on(t.clinicId)]);

export const invitations = pgTable("invitations", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull().references(() => clinics.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: roleEnum("role").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 3: Schema — scheduling**

```ts
// packages/db/src/schema/scheduling.ts
import { pgTable, text, integer, boolean, timestamp, time, date, pgEnum, index } from "drizzle-orm/pg-core";
import { clinics } from "./tenancy.js";

export const appointmentStatusEnum = pgEnum("appointment_status", ["scheduled", "confirmed", "rescheduled", "cancelled", "completed", "no_show"]);
export const appointmentSourceEnum = pgEnum("appointment_source", ["ai_call", "dashboard", "web"]);

export const doctors = pgTable("doctors", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull().references(() => clinics.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  title: text("title"), // e.g. "BDS, MDS (Orthodontics)"
  specialties: text("specialties").array().notNull().default([]),
  languages: text("languages").array().notNull().default(["en-IN"]),
  color: text("color").notNull().default("#16a34a"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("doctors_clinic_idx").on(t.clinicId)]);

export const workingHours = pgTable("working_hours", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull().references(() => clinics.id, { onDelete: "cascade" }),
  doctorId: text("doctor_id").notNull().references(() => doctors.id, { onDelete: "cascade" }),
  weekday: integer("weekday").notNull(), // 0 = Sunday … 6 = Saturday
  startTime: time("start_time").notNull(), // "10:00"
  endTime: time("end_time").notNull(),
}, (t) => [index("working_hours_doctor_idx").on(t.doctorId)]);

export const timeOff = pgTable("time_off", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull().references(() => clinics.id, { onDelete: "cascade" }),
  doctorId: text("doctor_id").notNull().references(() => doctors.id, { onDelete: "cascade" }),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  reason: text("reason"),
});

export const clinicHolidays = pgTable("clinic_holidays", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull().references(() => clinics.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  name: text("name").notNull(),
});

export const services = pgTable("services", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull().references(() => clinics.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  durationMin: integer("duration_min").notNull(),
  bufferMin: integer("buffer_min").notNull().default(0),
  priceInr: integer("price_inr"),
  bookableByAi: boolean("bookable_by_ai").notNull().default(true),
  active: boolean("active").notNull().default(true),
}, (t) => [index("services_clinic_idx").on(t.clinicId)]);

export const slotRules = pgTable("slot_rules", {
  clinicId: text("clinic_id").primaryKey().references(() => clinics.id, { onDelete: "cascade" }),
  slotGrainMin: integer("slot_grain_min").notNull().default(15),
  leadTimeMin: integer("lead_time_min").notNull().default(60),
  maxDaysAhead: integer("max_days_ahead").notNull().default(30),
  allowSameDay: boolean("allow_same_day").notNull().default(true),
  maxPerSlot: integer("max_per_slot").notNull().default(1),
});

export const appointments = pgTable("appointments", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull().references(() => clinics.id, { onDelete: "cascade" }),
  patientId: text("patient_id").notNull(),
  doctorId: text("doctor_id").notNull().references(() => doctors.id),
  serviceId: text("service_id").notNull().references(() => services.id),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  status: appointmentStatusEnum("status").notNull().default("scheduled"),
  source: appointmentSourceEnum("source").notNull().default("dashboard"),
  createdByCallId: text("created_by_call_id"),
  notes: text("notes"),
  reminder24hSentAt: timestamp("reminder_24h_sent_at", { withTimezone: true }),
  reminder2hSentAt: timestamp("reminder_2h_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("appointments_clinic_start_idx").on(t.clinicId, t.startsAt), index("appointments_doctor_start_idx").on(t.doctorId, t.startsAt), index("appointments_patient_idx").on(t.patientId)]);
```

- [ ] **Step 4: Schema — patients, calls, messaging, billing, misc**

```ts
// packages/db/src/schema/patients.ts
import { pgTable, text, timestamp, date, uniqueIndex } from "drizzle-orm/pg-core";
import { clinics } from "./tenancy.js";
export const patients = pgTable("patients", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull().references(() => clinics.id, { onDelete: "cascade" }),
  phone: text("phone").notNull(),
  name: text("name"),
  preferredLanguage: text("preferred_language").notNull().default("en-IN"),
  dob: date("dob"),
  notes: text("notes"),
  consentAt: timestamp("consent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("patients_clinic_phone_idx").on(t.clinicId, t.phone)]);
```

```ts
// packages/db/src/schema/calls.ts
import { pgTable, text, integer, timestamp, jsonb, pgEnum, index } from "drizzle-orm/pg-core";
import { clinics } from "./tenancy.js";

export const callChannelEnum = pgEnum("call_channel", ["browser", "phone"]);
export const callStatusEnum = pgEnum("call_status", ["in_progress", "completed", "failed"]);
export const callOutcomeEnum = pgEnum("call_outcome", ["booked", "rescheduled", "cancelled", "info", "callback", "handoff", "abandoned", "unknown"]);
export const turnRoleEnum = pgEnum("turn_role", ["user", "assistant", "tool"]);
export const callbackStatusEnum = pgEnum("callback_status", ["open", "done"]);

export const calls = pgTable("calls", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull().references(() => clinics.id, { onDelete: "cascade" }),
  channel: callChannelEnum("channel").notNull(),
  callerPhone: text("caller_phone"),
  patientId: text("patient_id"),
  startedByUserId: text("started_by_user_id"),
  languageDetected: text("language_detected"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  durationS: integer("duration_s"),
  status: callStatusEnum("status").notNull().default("in_progress"),
  outcome: callOutcomeEnum("outcome"),
  recordingS3Key: text("recording_s3_key"),
  transcriptS3Key: text("transcript_s3_key"),
  summary: text("summary"),
  sentiment: text("sentiment"),
  metrics: jsonb("metrics").$type<Record<string, number>>().notNull().default({}),
}, (t) => [index("calls_clinic_started_idx").on(t.clinicId, t.startedAt)]);

export const callTurns = pgTable("call_turns", {
  id: text("id").primaryKey(),
  callId: text("call_id").notNull().references(() => calls.id, { onDelete: "cascade" }),
  seq: integer("seq").notNull(),
  role: turnRoleEnum("role").notNull(),
  text: text("text"),
  toolName: text("tool_name"),
  toolArgs: jsonb("tool_args"),
  toolResult: jsonb("tool_result"),
  latencyMs: integer("latency_ms"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("call_turns_call_seq_idx").on(t.callId, t.seq)]);

export const callbacks = pgTable("callbacks", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull().references(() => clinics.id, { onDelete: "cascade" }),
  callId: text("call_id"),
  patientId: text("patient_id"),
  phone: text("phone").notNull(),
  reason: text("reason").notNull(),
  priority: text("priority").notNull().default("normal"),
  status: callbackStatusEnum("status").notNull().default("open"),
  assignedTo: text("assigned_to"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  doneAt: timestamp("done_at", { withTimezone: true }),
});

export const assistantProfiles = pgTable("assistant_profiles", {
  clinicId: text("clinic_id").primaryKey().references(() => clinics.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("Muxaris"),
  greeting: jsonb("greeting").$type<Record<string, string>>().notNull().default({}), // by language code
  voices: jsonb("voices").$type<Record<string, string>>().notNull().default({}),     // language → sarvam speaker
  tone: text("tone").notNull().default("warm"),
  handoffNumber: text("handoff_number"),
  faq: jsonb("faq").$type<Array<{ q: string; a: string }>>().notNull().default([]),
  knowledge: text("knowledge"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

```ts
// packages/db/src/schema/messaging.ts
import { pgTable, text, timestamp, jsonb, pgEnum, index } from "drizzle-orm/pg-core";
import { clinics } from "./tenancy.js";
export const notificationChannelEnum = pgEnum("notification_channel", ["email", "sms", "whatsapp"]);
export const notificationStatusEnum = pgEnum("notification_status", ["queued", "sent", "failed", "skipped"]);
export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull().references(() => clinics.id, { onDelete: "cascade" }),
  channel: notificationChannelEnum("channel").notNull(),
  to: text("to").notNull(),
  template: text("template").notNull(),
  language: text("language").notNull().default("en-IN"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  status: notificationStatusEnum("status").notNull().default("queued"),
  providerId: text("provider_id"),
  error: text("error"),
  appointmentId: text("appointment_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
}, (t) => [index("notifications_clinic_created_idx").on(t.clinicId, t.createdAt)]);
```

```ts
// packages/db/src/schema/billing.ts
import { pgTable, text, integer, primaryKey } from "drizzle-orm/pg-core";
import { clinics } from "./tenancy.js";
export const plans = pgTable("plans", {
  id: text("id").primaryKey(), // "pilot" | "standard"
  name: text("name").notNull(),
  priceInrMonthly: integer("price_inr_monthly").notNull(),
  includedCallMinutes: integer("included_call_minutes").notNull(),
  maxConcurrentCalls: integer("max_concurrent_calls").notNull().default(2),
  features: text("features").array().notNull().default([]),
});
export const usageLedger = pgTable("usage_ledger", {
  clinicId: text("clinic_id").notNull().references(() => clinics.id, { onDelete: "cascade" }),
  month: text("month").notNull(), // "2026-10"
  callSeconds: integer("call_seconds").notNull().default(0),
  calls: integer("calls").notNull().default(0),
  llmInputTokens: integer("llm_input_tokens").notNull().default(0),
  llmOutputTokens: integer("llm_output_tokens").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.clinicId, t.month] })]);
```

```ts
// packages/db/src/schema/misc.ts
import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
export const demoRequests = pgTable("demo_requests", {
  id: text("id").primaryKey(),
  clinic: text("clinic").notNull(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  city: text("city").notNull(),
  specialty: text("specialty").notNull(),
  status: text("status").notNull().default("new"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const auditLog = pgTable("audit_log", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id"),
  actorId: text("actor_id"),
  action: text("action").notNull(),
  entity: text("entity"),
  entityId: text("entity_id"),
  data: jsonb("data"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

```ts
// packages/db/src/schema/index.ts
export * from "./tenancy.js";
export * from "./scheduling.js";
export * from "./patients.js";
export * from "./calls.js";
export * from "./messaging.js";
export * from "./billing.js";
export * from "./misc.js";
```

- [ ] **Step 5: Client, migrate runner, index**

```ts
// packages/db/src/client.ts
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";
export type Db = NodePgDatabase<typeof schema>;
export function createDb(url: string): { db: Db; pool: pg.Pool } {
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  return { db: drizzle(pool, { schema }), pool };
}
```

```ts
// packages/db/src/migrate.ts
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "./client.js";
const url = process.env.DATABASE_URL ?? "postgres://muxaris:muxaris@localhost:5433/muxaris";
const { db, pool } = createDb(url);
await migrate(db, { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
await pool.end();
console.log("migrations applied");
```

```ts
// packages/db/src/index.ts
export * from "./client.js";
export * from "./ids.js";
export * as schema from "./schema/index.js";
```

- [ ] **Step 6: Generate the migration and apply it**

Run: `npm install && npm run db:up && sleep 3 && npm run db:generate && npm run db:migrate`
Expected: `packages/db/drizzle/0000_*.sql` created; "migrations applied". Then `docker exec muxaris-postgres psql -U muxaris -c '\dt'` lists 20 tables.

- [ ] **Step 7: Commit**

```bash
git add packages/db
git commit -m "feat(db): Drizzle schema for tenancy, scheduling, calls, messaging, billing

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Demo clinic seed (idempotent)

**Files:**
- Create: `packages/db/src/seed.ts`, `packages/db/src/seed-data.ts`, `packages/db/src/seed.test.ts`, `packages/db/vitest.config.ts`

**Interfaces:**
- Produces: `seedDemoClinic(db): Promise<{ clinicId: string }>` exported from `seed-data.ts`; the demo clinic has fixed ids `cl_demo_sunrise`, doctors `doc_demo_rao`, `doc_demo_shetty`, plan rows `pilot` and `standard`.

- [ ] **Step 1: Write the failing test (runs against the compose Postgres)**

```ts
// packages/db/src/seed.test.ts
import { describe, expect, it, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { createDb } from "./client.js";
import { schema } from "./index.js";
import { seedDemoClinic } from "./seed-data.js";

const url = process.env.DATABASE_URL ?? "postgres://muxaris:muxaris@localhost:5433/muxaris";
const { db } = createDb(url);

describe("seedDemoClinic", () => {
  beforeAll(async () => { await seedDemoClinic(db); });
  it("is idempotent", async () => {
    await seedDemoClinic(db);
    const docs = await db.select().from(schema.doctors).where(eq(schema.doctors.clinicId, "cl_demo_sunrise"));
    expect(docs).toHaveLength(2);
    const svcs = await db.select().from(schema.services).where(eq(schema.services.clinicId, "cl_demo_sunrise"));
    expect(svcs.length).toBeGreaterThanOrEqual(6);
  });
  it("creates working hours Mon–Sat 10:00–20:00 for both doctors", async () => {
    const rows = await db.select().from(schema.workingHours).where(eq(schema.workingHours.clinicId, "cl_demo_sunrise"));
    expect(rows).toHaveLength(12);
    expect(rows.every((r) => r.weekday >= 1 && r.weekday <= 6)).toBe(true);
  });
  it("creates both plans", async () => {
    const rows = await db.select().from(schema.plans);
    expect(rows.map((p) => p.id).sort()).toEqual(["pilot", "standard"]);
  });
});
```

```ts
// packages/db/vitest.config.ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["src/**/*.test.ts"], testTimeout: 20000 } });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w @muxaris/db`
Expected: FAIL (`seed-data.js` not found).

- [ ] **Step 3: Implement the seed**

```ts
// packages/db/src/seed-data.ts
import { sql } from "drizzle-orm";
import type { Db } from "./client.js";
import * as s from "./schema/index.js";

export const DEMO_CLINIC_ID = "cl_demo_sunrise";

export async function seedDemoClinic(db: Db): Promise<{ clinicId: string }> {
  await db.insert(s.plans).values([
    { id: "pilot", name: "Pilot", priceInrMonthly: 0, includedCallMinutes: 500, maxConcurrentCalls: 2, features: ["ai_receptionist", "dashboard", "email_confirmations"] },
    { id: "standard", name: "Standard", priceInrMonthly: 4999, includedCallMinutes: 3000, maxConcurrentCalls: 5, features: ["ai_receptionist", "dashboard", "email_confirmations", "whatsapp", "reminders", "priority_support"] },
  ]).onConflictDoUpdate({ target: s.plans.id, set: { name: sql`excluded.name`, priceInrMonthly: sql`excluded.price_inr_monthly`, includedCallMinutes: sql`excluded.included_call_minutes`, maxConcurrentCalls: sql`excluded.max_concurrent_calls`, features: sql`excluded.features` } });

  await db.insert(s.clinics).values({
    id: DEMO_CLINIC_ID, name: "Sunrise Dental Care", slug: "sunrise-dental-care", specialty: "dental",
    city: "Bengaluru", address: "41, 9th Block, Jayanagar, Bengaluru 560069", phone: "+918041234567",
    languages: ["en-IN", "kn-IN", "hi-IN", "ta-IN", "te-IN"], onboardingStep: "done",
  }).onConflictDoNothing();

  await db.insert(s.doctors).values([
    { id: "doc_demo_rao", clinicId: DEMO_CLINIC_ID, name: "Dr. Meera Rao", title: "BDS, General Dentistry", specialties: ["general", "cleaning", "fillings", "root_canal"], languages: ["en-IN", "kn-IN", "hi-IN"], color: "#16a34a" },
    { id: "doc_demo_shetty", clinicId: DEMO_CLINIC_ID, name: "Dr. Arjun Shetty", title: "MDS, Orthodontics", specialties: ["orthodontics", "braces", "aligners"], languages: ["en-IN", "kn-IN", "ta-IN"], color: "#2563eb" },
  ]).onConflictDoNothing();

  const hours = ["doc_demo_rao", "doc_demo_shetty"].flatMap((doctorId) =>
    [1, 2, 3, 4, 5, 6].map((weekday) => ({ id: `wh_demo_${doctorId}_${weekday}`, clinicId: DEMO_CLINIC_ID, doctorId, weekday, startTime: "10:00", endTime: "20:00" })),
  );
  await db.insert(s.workingHours).values(hours).onConflictDoNothing();

  await db.insert(s.services).values([
    { id: "svc_demo_consult", clinicId: DEMO_CLINIC_ID, name: "Consultation", durationMin: 20, bufferMin: 5, priceInr: 500, description: "First visit or general check-up" },
    { id: "svc_demo_cleaning", clinicId: DEMO_CLINIC_ID, name: "Teeth cleaning (scaling)", durationMin: 30, bufferMin: 10, priceInr: 1500 },
    { id: "svc_demo_filling", clinicId: DEMO_CLINIC_ID, name: "Filling", durationMin: 45, bufferMin: 10, priceInr: 2000 },
    { id: "svc_demo_rct", clinicId: DEMO_CLINIC_ID, name: "Root canal", durationMin: 60, bufferMin: 15, priceInr: 6000 },
    { id: "svc_demo_ortho", clinicId: DEMO_CLINIC_ID, name: "Orthodontic consultation", durationMin: 30, bufferMin: 10, priceInr: 800 },
    { id: "svc_demo_whitening", clinicId: DEMO_CLINIC_ID, name: "Teeth whitening", durationMin: 60, bufferMin: 10, priceInr: 8000 },
  ]).onConflictDoNothing();

  await db.insert(s.slotRules).values({ clinicId: DEMO_CLINIC_ID, slotGrainMin: 15, leadTimeMin: 60, maxDaysAhead: 30, allowSameDay: true, maxPerSlot: 1 }).onConflictDoNothing();

  await db.insert(s.assistantProfiles).values({
    clinicId: DEMO_CLINIC_ID, name: "Muxaris", tone: "warm", handoffNumber: "+918041234567",
    greeting: {
      "en-IN": "Hello, Sunrise Dental Care. How may I help you today?",
      "hi-IN": "नमस्ते, सनराइज़ डेंटल केयर। मैं आपकी कैसे मदद कर सकती हूँ?",
      "kn-IN": "ನಮಸ್ಕಾರ, ಸನ್‌ರೈಸ್ ಡೆಂಟಲ್ ಕೇರ್. ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ?",
      "ta-IN": "வணக்கம், சன்ரைஸ் டென்டல் கேர். நான் உங்களுக்கு எப்படி உதவலாம்?",
      "te-IN": "నమస్కారం, సన్‌రైజ్ డెంటల్ కేర్. నేను మీకు ఎలా సహాయం చేయగలను?",
    },
    voices: { "en-IN": "anushka", "hi-IN": "anushka", "kn-IN": "anushka", "ta-IN": "anushka", "te-IN": "anushka" },
    faq: [
      { q: "Where is the clinic?", a: "41, 9th Block, Jayanagar, Bengaluru, near the Jayanagar 4th Block bus stand. Parking is available." },
      { q: "Do you accept insurance?", a: "We accept most major dental insurance plans and provide bills for reimbursement." },
      { q: "What are your timings?", a: "10 AM to 8 PM, Monday to Saturday. Closed on Sundays." },
    ],
    knowledge: "Dr. Rao handles general dentistry, cleaning, fillings and root canals. Dr. Shetty handles braces and aligners. First consultation is ₹500.",
  }).onConflictDoNothing();

  return { clinicId: DEMO_CLINIC_ID };
}
```

```ts
// packages/db/src/seed.ts
import { createDb } from "./client.js";
import { seedDemoClinic } from "./seed-data.js";
const url = process.env.DATABASE_URL ?? "postgres://muxaris:muxaris@localhost:5433/muxaris";
const { db, pool } = createDb(url);
const { clinicId } = await seedDemoClinic(db);
await pool.end();
console.log(`seeded demo clinic ${clinicId}`);
```

- [ ] **Step 4: Run tests**

Run: `npm run db:migrate && npm test -w @muxaris/db && npm run db:seed && npm run db:seed`
Expected: 3 tests pass; both seed runs print `seeded demo clinic cl_demo_sunrise`.

- [ ] **Step 5: Commit**

```bash
git add packages/db
git commit -m "feat(db): idempotent demo clinic seed (Sunrise Dental Care)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: AWS account guard, CDK app and the Cognito `MuxarisAuth` stack

**Files:**
- Create: `scripts/lib/aws-guard.sh`, `scripts/bootstrap-aws.sh`, `infra/package.json`, `infra/tsconfig.json`, `infra/cdk.json`, `infra/bin/muxaris.ts`, `infra/lib/config.ts`, `infra/lib/auth-stack.ts`, `infra/test/auth-stack.test.ts`, `infra/vitest.config.ts`

**Interfaces:**
- Produces: `MuxarisAuth` CloudFormation stack with outputs `UserPoolId`, `UserPoolClientId`, `UserPoolDomain`; `scripts/lib/aws-guard.sh` (source it; exits 1 on wrong account); `scripts/bootstrap-aws.sh` which bootstraps CDK, deploys `MuxarisAuth`, and prints `.env` lines.

- [ ] **Step 1: Write the guard and prove it blocks the primary account**

```bash
#!/usr/bin/env bash
# scripts/lib/aws-guard.sh — source this at the top of every AWS-touching script.
# Forces the secondary account and aborts on anything else.
set -euo pipefail
export AWS_PROFILE="aws-secondary-account"
export AWS_REGION="ap-south-1"
export AWS_DEFAULT_REGION="ap-south-1"
export CDK_DEFAULT_ACCOUNT="005533348545"
export CDK_DEFAULT_REGION="ap-south-1"
MUXARIS_AWS_ACCOUNT="005533348545"

if ! command -v aws >/dev/null 2>&1; then echo "aws cli not found" >&2; exit 1; fi
ACTUAL="$(aws sts get-caller-identity --query Account --output text 2>/dev/null || true)"
if [[ "$ACTUAL" != "$MUXARIS_AWS_ACCOUNT" ]]; then
  echo "ABORT: AWS caller account is '${ACTUAL:-none}', expected ${MUXARIS_AWS_ACCOUNT} (profile aws-secondary-account)." >&2
  exit 1
fi
echo "aws-guard: account ${ACTUAL} region ${AWS_REGION} profile ${AWS_PROFILE}"
```

Run: `chmod +x scripts/lib/aws-guard.sh && bash scripts/lib/aws-guard.sh`
Expected: prints `aws-guard: account 005533348545 …`.
Then negative test: `bash -c 'export AWS_PROFILE=default; source scripts/lib/aws-guard.sh'` must still print account 005533348545 because the guard overrides `AWS_PROFILE`. Finally simulate a wrong account: `bash -c 'sed "s/005533348545/000000000000/" scripts/lib/aws-guard.sh | bash'` → prints `ABORT: …` and exits 1.

- [ ] **Step 2: CDK package files**

```json
// infra/package.json
{
  "name": "@muxaris/infra",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "synth": "cdk synth",
    "deploy:auth": "cdk deploy MuxarisAuth --require-approval never",
    "cdk": "cdk"
  },
  "dependencies": { "aws-cdk-lib": "^2.200", "constructs": "^10" },
  "devDependencies": { "aws-cdk": "^2.1000", "tsx": "^4", "typescript": "^5.9", "vitest": "^3" }
}
```

```json
// infra/cdk.json
{ "app": "npx tsx bin/muxaris.ts", "context": { "@aws-cdk/core:newStyleStackSynthesis": true } }
```

```json
// infra/tsconfig.json
{ "extends": "../tsconfig.base.json", "compilerOptions": { "noEmit": true, "lib": ["ES2023"], "types": ["node"] }, "include": ["bin", "lib", "test"] }
```

```ts
// infra/lib/config.ts
export const ACCOUNT = "005533348545";
export const REGION = "ap-south-1";
export const ENV = { account: ACCOUNT, region: REGION } as const;
export const PROJECT = "muxaris";
export const DOMAIN = "muxaris.com";
export const WEB_ORIGINS = ["https://muxaris.com", "https://www.muxaris.com", "http://localhost:3000"];
```

- [ ] **Step 3: Write the failing stack test**

```ts
// infra/test/auth-stack.test.ts
import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { AuthStack } from "../lib/auth-stack.js";
import { ENV } from "../lib/config.js";

describe("MuxarisAuth", () => {
  const app = new App();
  const stack = new AuthStack(app, "MuxarisAuth", { env: ENV });
  const t = Template.fromStack(stack);

  it("pins the secondary account", () => {
    expect(stack.account).toBe("005533348545");
    expect(stack.region).toBe("ap-south-1");
  });
  it("creates a user pool with email sign-in and verification", () => {
    t.hasResourceProperties("AWS::Cognito::UserPool", {
      UsernameAttributes: ["email"],
      AutoVerifiedAttributes: ["email"],
      Policies: { PasswordPolicy: { MinimumLength: 10 } },
    });
  });
  it("creates a public PKCE client with localhost and production callbacks", () => {
    t.hasResourceProperties("AWS::Cognito::UserPoolClient", {
      GenerateSecret: false,
      AllowedOAuthFlows: ["code"],
      CallbackURLs: ["https://muxaris.com/auth/callback", "https://www.muxaris.com/auth/callback", "http://localhost:3000/auth/callback"],
    });
  });
  it("exports the ids", () => {
    t.hasOutput("UserPoolId", {});
    t.hasOutput("UserPoolClientId", {});
    t.hasOutput("UserPoolDomain", {});
  });
});
```

```ts
// infra/vitest.config.ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["test/**/*.test.ts"] } });
```

- [ ] **Step 4: Run to verify it fails**

Run: `npm install && npm test -w @muxaris/infra`
Expected: FAIL (`auth-stack.js` not found).

- [ ] **Step 5: Implement the Auth stack**

```ts
// infra/lib/auth-stack.ts
import { CfnOutput, Duration, RemovalPolicy, SecretValue, Stack, type StackProps } from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import type { Construct } from "constructs";
import { PROJECT, WEB_ORIGINS } from "./config.js";

export interface AuthStackProps extends StackProps {
  googleClientId?: string;
  googleClientSecret?: string;
}

export class AuthStack extends Stack {
  readonly userPool: cognito.UserPool;
  readonly userPoolClient: cognito.UserPoolClient;
  readonly domain: cognito.UserPoolDomain;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    this.userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: `${PROJECT}-users`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: true }, fullname: { required: false, mutable: true } },
      passwordPolicy: { minLength: 10, requireLowercase: true, requireDigits: true, requireUppercase: false, requireSymbols: false },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      mfa: cognito.Mfa.OFF,
      removalPolicy: RemovalPolicy.RETAIN,
      userVerification: {
        emailSubject: "Your Muxaris verification code",
        emailBody: "Welcome to Muxaris. Your verification code is {####}.",
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
    });

    const callbackUrls = WEB_ORIGINS.map((o) => `${o}/auth/callback`);
    const logoutUrls = WEB_ORIGINS.map((o) => `${o}/`);

    const providers: cognito.UserPoolClientIdentityProvider[] = [cognito.UserPoolClientIdentityProvider.COGNITO];
    if (props.googleClientId && props.googleClientSecret) {
      const google = new cognito.UserPoolIdentityProviderGoogle(this, "Google", {
        userPool: this.userPool,
        clientId: props.googleClientId,
        clientSecretValue: SecretValue.unsafePlainText(props.googleClientSecret),
        scopes: ["openid", "email", "profile"],
        attributeMapping: { email: cognito.ProviderAttribute.GOOGLE_EMAIL, fullname: cognito.ProviderAttribute.GOOGLE_NAME },
      });
      providers.push(cognito.UserPoolClientIdentityProvider.GOOGLE);
      this.userPool.registerIdentityProvider(google);
    }

    this.userPoolClient = this.userPool.addClient("WebClient", {
      userPoolClientName: `${PROJECT}-web`,
      generateSecret: false,
      authFlows: { userSrp: true, userPassword: false },
      oAuth: { flows: { authorizationCodeGrant: true }, scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE], callbackUrls, logoutUrls },
      supportedIdentityProviders: providers,
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
      preventUserExistenceErrors: true,
    });

    this.domain = this.userPool.addDomain("Domain", { cognitoDomain: { domainPrefix: `${PROJECT}-auth` } });

    new CfnOutput(this, "UserPoolId", { value: this.userPool.userPoolId });
    new CfnOutput(this, "UserPoolClientId", { value: this.userPoolClient.userPoolClientId });
    new CfnOutput(this, "UserPoolDomain", { value: `${this.domain.domainName}.auth.${this.region}.amazoncognito.com` });
  }
}
```

Note for the implementer: `clientSecretValue` is the current `aws-cdk-lib` API (the string `clientSecret` prop is deprecated). Confirm with `npx tsc --noEmit`.

```ts
// infra/bin/muxaris.ts
import { App } from "aws-cdk-lib";
import { AuthStack } from "../lib/auth-stack.js";
import { ENV } from "../lib/config.js";

const app = new App();
new AuthStack(app, "MuxarisAuth", {
  env: ENV,
  googleClientId: process.env.GOOGLE_OAUTH_CLIENT_ID || undefined,
  googleClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || undefined,
  description: "Muxaris: Cognito user pool for the web app",
});
```

- [ ] **Step 6: Run tests, then synth**

Run: `npm test -w @muxaris/infra && (cd infra && source ../scripts/lib/aws-guard.sh && npx cdk synth MuxarisAuth > /dev/null && echo synth-ok)`
Expected: 4 tests pass; `synth-ok`.

- [ ] **Step 7: Bootstrap script**

```bash
#!/usr/bin/env bash
# scripts/bootstrap-aws.sh — one-time (idempotent) setup of the secondary account.
# Usage: scripts/bootstrap-aws.sh            # bootstrap CDK + deploy MuxarisAuth, print env lines
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/scripts/lib/aws-guard.sh"
if [[ -f "$ROOT/.env" ]]; then set -a; source "$ROOT/.env"; set +a; fi
# .env may override AWS_PROFILE; re-assert the guard values.
export AWS_PROFILE="aws-secondary-account" AWS_REGION="ap-south-1"

cd "$ROOT/infra"
echo "→ cdk bootstrap"
npx cdk bootstrap "aws://005533348545/ap-south-1" --require-approval never
echo "→ deploy MuxarisAuth"
npx cdk deploy MuxarisAuth --require-approval never --outputs-file /tmp/muxaris-auth-outputs.json

POOL=$(jq -r '.MuxarisAuth.UserPoolId' /tmp/muxaris-auth-outputs.json)
CLIENT=$(jq -r '.MuxarisAuth.UserPoolClientId' /tmp/muxaris-auth-outputs.json)
DOMAIN=$(jq -r '.MuxarisAuth.UserPoolDomain' /tmp/muxaris-auth-outputs.json)
cat <<EOF

Add these to .env and to Netlify environment variables:
NEXT_PUBLIC_COGNITO_USER_POOL_ID=$POOL
NEXT_PUBLIC_COGNITO_CLIENT_ID=$CLIENT
NEXT_PUBLIC_COGNITO_DOMAIN=$DOMAIN
COGNITO_USER_POOL_ID=$POOL
COGNITO_CLIENT_ID=$CLIENT
EOF
```

Run: `chmod +x scripts/bootstrap-aws.sh && scripts/bootstrap-aws.sh`
Expected: CDK bootstrap stack `CDKToolkit` and `MuxarisAuth` created in account 005533348545; the five env lines printed. Then append them to `.env` (values only in `.env`, never in the commit).

- [ ] **Step 8: Verify the pool exists**

Run: `source scripts/lib/aws-guard.sh && aws cognito-idp describe-user-pool --user-pool-id "$(jq -r .MuxarisAuth.UserPoolId /tmp/muxaris-auth-outputs.json)" --query 'UserPool.{Name:Name,Status:Status}'`
Expected: `Name: muxaris-users`.

- [ ] **Step 9: Commit**

```bash
git add scripts infra
git commit -m "feat(infra): AWS account guard, CDK app and Cognito MuxarisAuth stack

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Spikes — Sarvam TTS, Sarvam STT streaming, Bedrock tool calling

**Files:**
- Create: `scripts/spike/package.json` (not a workspace; standalone), `scripts/spike/env.ts`, `scripts/spike/sarvam-tts.ts`, `scripts/spike/sarvam-stt.ts`, `scripts/spike/bedrock-tools.ts`, `docs/SPIKES.md`
- Output dir (gitignored): `scripts/spike/out/`

**Interfaces:**
- Produces: `docs/SPIKES.md` with the verified TTS WebSocket URL + message schema (or the decision to use REST per sentence), STT event schema observed, Bedrock model id or inference-profile ARN that works in ap-south-1, measured latencies.

- [ ] **Step 1: Shared env loader**

```ts
// scripts/spike/env.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const envPath = resolve(import.meta.dirname, "../../.env");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^"|"$/g, "");
}
export const SARVAM_KEY = process.env.SARVAM_TTS_API_KEY ?? "";
if (!SARVAM_KEY) { console.error("SARVAM_TTS_API_KEY missing in .env"); process.exit(1); }
export function fail(step: string, status: number | string, body: unknown): never {
  console.error(`${step} failed: status=${status} body=${typeof body === "string" ? body.slice(0, 300) : JSON.stringify(body).slice(0, 300)}`);
  process.exit(1);
}
```

- [ ] **Step 2: TTS spike (REST first, then WS discovery)**

```ts
// scripts/spike/sarvam-tts.ts
// Run: npx tsx scripts/spike/sarvam-tts.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { SARVAM_KEY, fail } from "./env.js";

mkdirSync(new URL("./out/", import.meta.url), { recursive: true });
const text = "Namaskara. Doctor Rao is available tomorrow at 4:30 PM. Should I book it?";

// 1) REST (documented): POST https://api.sarvam.ai/text-to-speech
const t0 = performance.now();
const res = await fetch("https://api.sarvam.ai/text-to-speech", {
  method: "POST",
  headers: { "api-subscription-key": SARVAM_KEY, "content-type": "application/json" },
  body: JSON.stringify({ text, target_language_code: "en-IN", speaker: "anushka", model: "bulbul:v3", pace: 1.0, speech_sample_rate: 24000 }),
});
if (!res.ok) fail("tts-rest", res.status, await res.text());
const json = (await res.json()) as { audios: string[] };
const wav = Buffer.from(json.audios[0]!, "base64");
writeFileSync(new URL("./out/tts-rest.wav", import.meta.url), wav);
console.log(`tts-rest ok: ${wav.length} bytes in ${Math.round(performance.now() - t0)} ms → scripts/spike/out/tts-rest.wav`);

// 2) WS discovery: inspect the official SDK for the streaming URL, then try it.
//    `npm view sarvamai` and read node_modules/sarvamai/dist for "text-to-speech/ws".
//    Record the exact URL, auth header and message schema in docs/SPIKES.md.
//    If it works, stream the same text and save out/tts-ws.pcm; else note "REST per sentence" as the decision.
```

Run: `cd scripts/spike && npm init -y >/dev/null && npm i sarvamai ws @types/ws >/dev/null && cd ../.. && npx tsx scripts/spike/sarvam-tts.ts && afplay scripts/spike/out/tts-rest.wav`
Expected: `tts-rest ok` and audible speech. Then: `grep -rho 'wss://[^"\x27 ]*' scripts/spike/node_modules/sarvamai/dist | sort -u` — record the TTS streaming URL(s) and read the surrounding code for message field names. Extend the spike with a WS attempt and record results.

- [ ] **Step 3: STT streaming spike**

```ts
// scripts/spike/sarvam-stt.ts
// Run: npx tsx scripts/spike/sarvam-stt.ts [path/to/16k-mono.wav]
// Default input: out/tts-rest.wav (from the TTS spike), resampled is NOT needed if we request 24000? Sarvam STT supports 16000 or 8000 → convert first:
//   ffmpeg -y -i scripts/spike/out/tts-rest.wav -ar 16000 -ac 1 -f s16le scripts/spike/out/in16k.pcm
import { readFileSync } from "node:fs";
import WebSocket from "ws";
import { SARVAM_KEY, fail } from "./env.js";

const pcmPath = process.argv[2] ?? new URL("./out/in16k.pcm", import.meta.url).pathname;
const pcm = readFileSync(pcmPath);
const url = "wss://api.sarvam.ai/speech-to-text/ws?model=saaras:v4&language-code=unknown&mode=codemix&sample_rate=16000&input_audio_codec=pcm_s16le&vad_signals=true";
const ws = new WebSocket(url, { headers: { "Api-Subscription-Key": SARVAM_KEY } });
const t0 = performance.now();
ws.on("open", async () => {
  console.log(`stt ws open in ${Math.round(performance.now() - t0)} ms`);
  const frame = 16000 * 2 * 0.1; // 100 ms of 16 kHz PCM16
  for (let i = 0; i < pcm.length; i += frame) {
    ws.send(JSON.stringify({ audio: { data: pcm.subarray(i, i + frame).toString("base64"), sample_rate: "16000", encoding: "audio/wav" } }));
    await new Promise((r) => setTimeout(r, 100)); // real-time pacing
  }
  ws.send(JSON.stringify({ type: "flush" }));
  setTimeout(() => ws.close(), 3000);
});
ws.on("message", (d) => console.log("stt ←", d.toString().slice(0, 400)));
ws.on("error", (e) => fail("stt-ws", "error", String(e)));
ws.on("close", (code, reason) => { console.log(`stt ws closed ${code} ${reason.toString()}`); process.exit(0); });
```

Run: `ffmpeg -y -i scripts/spike/out/tts-rest.wav -ar 16000 -ac 1 -f s16le scripts/spike/out/in16k.pcm && npx tsx scripts/spike/sarvam-stt.ts`
Expected: `START_SPEECH`/`END_SPEECH` event messages and a `{"type":"data",…"transcript":"…Doctor Rao…"}` message. If `mode=codemix` is rejected (4xxx close), retry without `mode` and record that. If `ffmpeg` is missing, use `afconvert -f WAVE -d LEI16@16000 -c 1 in.wav out16k.wav` and strip the 44-byte header.

- [ ] **Step 4: Bedrock tool-calling spike**

```ts
// scripts/spike/bedrock-tools.ts
// Run: source scripts/lib/aws-guard.sh && npx tsx scripts/spike/bedrock-tools.ts
import { BedrockRuntimeClient, ConverseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
import { ASSISTANT_TOOLS } from "../../packages/shared/src/tools.js";

if (process.env.CDK_DEFAULT_ACCOUNT !== "005533348545") { console.error("run via: source scripts/lib/aws-guard.sh first"); process.exit(1); }
const client = new BedrockRuntimeClient({ region: "ap-south-1" });
const candidates = [
  process.env.BEDROCK_MODEL_ID,
  "apac.anthropic.claude-haiku-4-5-20251001-v1:0",
  "anthropic.claude-haiku-4-5-20251001-v1:0",
  "global.anthropic.claude-haiku-4-5-20251001-v1:0",
].filter(Boolean) as string[];

for (const modelId of candidates) {
  const t0 = performance.now();
  try {
    const out = await client.send(new ConverseStreamCommand({
      modelId,
      system: [{ text: "You are Muxaris, the receptionist for Sunrise Dental Care. Use tools to check availability before offering times. Reply in at most two short sentences." }],
      messages: [{ role: "user", content: [{ text: "Hi, I need a teeth cleaning tomorrow afternoon." }] }],
      toolConfig: { tools: ASSISTANT_TOOLS.map((t) => ({ toolSpec: { name: t.name, description: t.description, inputSchema: { json: t.inputSchema } } })) },
      inferenceConfig: { maxTokens: 300, temperature: 0.3 },
    }));
    let firstToken = 0; let toolUse = ""; let text = "";
    for await (const ev of out.stream ?? []) {
      if (!firstToken && (ev.contentBlockDelta || ev.contentBlockStart)) firstToken = performance.now() - t0;
      if (ev.contentBlockStart?.start?.toolUse) toolUse = ev.contentBlockStart.start.toolUse.name ?? "";
      if (ev.contentBlockDelta?.delta?.text) text += ev.contentBlockDelta.delta.text;
      if (ev.contentBlockDelta?.delta?.toolUse?.input) toolUse += " " + ev.contentBlockDelta.delta.toolUse.input;
    }
    console.log(`OK model=${modelId} first-token=${Math.round(firstToken)} ms total=${Math.round(performance.now() - t0)} ms`);
    console.log(`  text="${text}"`);
    console.log(`  toolUse=${toolUse || "(none)"}`);
    process.exit(0);
  } catch (e) {
    console.log(`FAIL model=${modelId}: ${(e as Error).name}: ${(e as Error).message.slice(0, 200)}`);
  }
}
process.exit(1);
```

Run: `cd scripts/spike && npm i @aws-sdk/client-bedrock-runtime >/dev/null && cd ../.. && source scripts/lib/aws-guard.sh && aws bedrock list-inference-profiles --query 'inferenceProfileSummaries[?contains(inferenceProfileId, `haiku-4-5`)].inferenceProfileId' --output text; npx tsx scripts/spike/bedrock-tools.ts`
Expected: one `OK model=…` line with `toolUse=find_slots {…"date"…}` (the model should call `find_slots` for "tomorrow afternoon"). Record which id worked; if all fail with `AccessDeniedException`, enable model access in the Bedrock console for the secondary account and re-run (this is a user action; stop and report).

- [ ] **Step 5: Write `docs/SPIKES.md`**

Sections: Sarvam TTS (REST latency, WS URL + schema or "REST per sentence" decision, speaker used, sample rate), Sarvam STT (URL, params that worked, event schema seen verbatim, transcript quality note, open/first-result latency), Bedrock (working model id/profile, first-token and total latency, whether the tool call fired), and "Decisions for Phase 1" (3–5 bullets). Paste actual observed JSON (redact nothing sensitive; there are no secrets in responses).

- [ ] **Step 6: Commit (spike node_modules and out/ are ignored)**

Add `scripts/spike/node_modules` and `scripts/spike/package-lock.json` to `.gitignore` first.

```bash
git add .gitignore scripts/spike docs/SPIKES.md
git commit -m "chore(spike): verify Sarvam TTS/STT streaming and Bedrock tool calling in ap-south-1

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: `apps/web` scaffold (Next.js 16, Tailwind v4, brand tokens, fonts)

**Files:**
- Create: `apps/web/**` via `create-next-app`, then `apps/web/src/app/globals.css`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx` (placeholder), `apps/web/src/lib/env.ts`, `apps/web/public/brand/muxaris-wordmark.svg`, `apps/web/public/brand/muxaris-mark.svg`, `apps/web/src/app/icon.svg`, `apps/web/vitest.config.ts`

**Interfaces:**
- Produces: Tailwind theme tokens `--color-paper|surface|ink|ink-deep|accent|accent-deep|accent-soft|accent-bright|muted|line`, fonts `--font-display` (Fraunces) and `--font-body` (Inter) via `next/font/google`; `env` object with `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_VOICE_WS_URL`, Cognito ids.

- [ ] **Step 1: Scaffold**

Run from repo root:
```bash
npx create-next-app@latest apps/web --ts --tailwind --app --eslint --src-dir --import-alias "@/*" --use-npm --turbopack --no-git
cd apps/web && npm pkg set name="@muxaris/web" && npm pkg set scripts.typecheck="tsc --noEmit" && npm pkg set scripts.test="vitest run" && cd ../..
rm -f apps/web/package-lock.json
npm install
```
Expected: `apps/web` exists; root lockfile updated; `npm run build -w @muxaris/web` passes.

- [ ] **Step 2: Brand tokens and fonts**

```css
/* apps/web/src/app/globals.css */
@import "tailwindcss";

@theme {
  --color-ink: #0c1220;
  --color-ink-deep: #080d18;
  --color-paper: #fafaf7;
  --color-surface: #ffffff;
  --color-accent: #16a34a;
  --color-accent-deep: #128a3f;
  --color-accent-soft: #dcfce7;
  --color-accent-bright: #4ade80;
  --color-muted: #5b6472;
  --color-line: #e7e5df;
  --color-dark-text: #e8eaee;
  --color-dark-muted: #98a0ad;
  --font-display: var(--font-fraunces), Georgia, serif;
  --font-body: var(--font-inter), -apple-system, sans-serif;
  --shadow-lift: 0 12px 32px -12px rgb(12 18 32 / 0.14);
  --shadow-card: 0 24px 60px -24px rgb(12 18 32 / 0.22);
}

html { scroll-behavior: smooth; }
body { background: var(--color-paper); color: var(--color-ink); font-family: var(--font-body); -webkit-font-smoothing: antialiased; }
::selection { background: var(--color-accent-soft); color: var(--color-ink); }
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
```

```tsx
// apps/web/src/app/layout.tsx
import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", axes: ["opsz", "SOFT"], style: ["normal", "italic"] });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  metadataBase: new URL("https://muxaris.com"),
  title: { default: "Muxaris | AI Voice Receptionist for Indian Dental Clinics", template: "%s | Muxaris" },
  description: "Muxaris answers every call to your clinic in Kannada, Hindi, Tamil, Telugu or English, books the appointment against your real calendar, and confirms it to the patient.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

```ts
// apps/web/src/lib/env.ts
export const env = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
  voiceWsUrl: process.env.NEXT_PUBLIC_VOICE_WS_URL ?? "ws://localhost:4100",
  cognito: {
    userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ?? "",
    clientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? "",
    domain: process.env.NEXT_PUBLIC_COGNITO_DOMAIN ?? "",
  },
} as const;
```

- [ ] **Step 3: Wordmark, mark and placeholder page**

`muxaris-wordmark.svg`: the word "muxaris" set in Fraunces-like serif (use `<text>` with `font-family="Fraunces, Georgia, serif"` and `font-weight="600"`, fill `#0c1220`), with the dot of the "i" replaced by a small `#16a34a` circle. `muxaris-mark.svg` and `icon.svg`: a rounded square `#0c1220` with a green speech-wave glyph (three vertical rounded bars of heights 10/18/12 centred, fill `#16a34a`). Keep each SVG under 2 KB.

`page.tsx` placeholder: centred wordmark, `<h1 className="font-display text-5xl">Your front desk misses calls. Muxaris doesn’t.</h1>`, one paragraph, and a "Coming soon" note. This page is never deployed from this branch; it exists so the build passes.

- [ ] **Step 4: Verify**

Run: `npm run lint && npm run typecheck -w @muxaris/web && npm run build -w @muxaris/web`
Expected: all pass. `npm run dev -w @muxaris/web` serves the placeholder at http://localhost:3000 in Fraunces/Inter on paper background.

- [ ] **Step 5: Commit**

```bash
git add apps/web package-lock.json
git commit -m "feat(web): Next.js 16 scaffold with Muxaris brand tokens, fonts and wordmark

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: `apps/api` and `apps/voice-gateway` scaffolds with env loading, health endpoints and Dockerfiles

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/vitest.config.ts`, `apps/api/src/index.ts`, `apps/api/src/app.ts`, `apps/api/src/env.ts`, `apps/api/src/env.test.ts`, `apps/api/src/app.test.ts`, `apps/api/Dockerfile`
- Create: `apps/voice-gateway/package.json`, `apps/voice-gateway/tsconfig.json`, `apps/voice-gateway/vitest.config.ts`, `apps/voice-gateway/src/index.ts`, `apps/voice-gateway/src/server.ts`, `apps/voice-gateway/src/env.ts`, `apps/voice-gateway/src/server.test.ts`, `apps/voice-gateway/Dockerfile`
- Create: `scripts/dev.sh`, `.dockerignore`

**Interfaces:**
- Produces: `createApp(deps): Hono` with `GET /healthz → { ok: true, service: "api", version }`; gateway `createServer(deps): http.Server` with `GET /healthz` and a `ws` upgrade on `/v1/session` that currently replies `{ type: "error", code: "not_implemented" }` and closes; `loadEnv()` in each app returning `{ port, databaseUrl, sarvamKey: string | null, provider: "sarvam" | "mock" }`.

- [ ] **Step 1: API package files**

```json
// apps/api/package.json
{
  "name": "@muxaris/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": { "@hono/node-server": "^1", "@muxaris/db": "*", "@muxaris/shared": "*", "hono": "^4", "zod": "^4" },
  "devDependencies": { "tsx": "^4", "typescript": "^5.9", "vitest": "^3" }
}
```

`apps/api/tsconfig.json`: extends base, `outDir: dist`, `rootDir: src`, exclude tests. `vitest.config.ts`: include `src/**/*.test.ts`.

- [ ] **Step 2: Failing tests for env and health**

```ts
// apps/api/src/env.test.ts
import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";
describe("loadEnv", () => {
  it("falls back to mock provider when the Sarvam key is absent", () => {
    const env = loadEnv({ API_PORT: "4000", DATABASE_URL: "postgres://x" });
    expect(env.provider).toBe("mock");
    expect(env.sarvamKey).toBeNull();
    expect(env.port).toBe(4000);
  });
  it("uses sarvam when the key is present", () => {
    expect(loadEnv({ SARVAM_TTS_API_KEY: "k", DATABASE_URL: "postgres://x" }).provider).toBe("sarvam");
  });
  it("throws a readable error without DATABASE_URL", () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });
});
```

```ts
// apps/api/src/app.test.ts
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
describe("GET /healthz", () => {
  it("returns ok", async () => {
    const app = createApp({ version: "test" });
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, service: "api", version: "test" });
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm install && npm test -w @muxaris/api` → FAIL (modules missing).

- [ ] **Step 4: Implement**

```ts
// apps/api/src/env.ts
export interface ApiEnv { port: number; databaseUrl: string; sarvamKey: string | null; provider: "sarvam" | "mock"; corsOrigins: string[] }
export function loadEnv(src: NodeJS.ProcessEnv = process.env): ApiEnv {
  const databaseUrl = src.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required (see .env.example)");
  const sarvamKey = src.SARVAM_TTS_API_KEY?.trim() || null;
  return {
    port: Number(src.API_PORT ?? 4000),
    databaseUrl,
    sarvamKey,
    provider: sarvamKey ? "sarvam" : "mock",
    corsOrigins: (src.CORS_ORIGINS ?? "http://localhost:3000,https://muxaris.com,https://www.muxaris.com").split(","),
  };
}
```

```ts
// apps/api/src/app.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
export interface AppDeps { version: string; corsOrigins?: string[] }
export function createApp(deps: AppDeps) {
  const app = new Hono();
  app.use(logger());
  app.use("*", cors({ origin: deps.corsOrigins ?? "*", allowHeaders: ["Authorization", "Content-Type", "X-Clinic-Id"] }));
  app.get("/healthz", (c) => c.json({ ok: true, service: "api", version: deps.version }));
  return app;
}
```

```ts
// apps/api/src/index.ts
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadEnv } from "./env.js";
const env = loadEnv();
if (env.provider === "mock") console.warn("SARVAM_TTS_API_KEY not set: running with mock voice providers");
const app = createApp({ version: process.env.GIT_SHA ?? "dev", corsOrigins: env.corsOrigins });
serve({ fetch: app.fetch, port: env.port }, () => console.log(`api listening on :${env.port}`));
```

Gateway mirrors this with `ws`:

```json
// apps/voice-gateway/package.json
{
  "name": "@muxaris/voice-gateway",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": { "dev": "tsx watch src/index.ts", "build": "tsc -p tsconfig.json", "start": "node dist/index.js", "typecheck": "tsc -p tsconfig.json --noEmit", "test": "vitest run" },
  "dependencies": { "@muxaris/db": "*", "@muxaris/shared": "*", "ws": "^8" },
  "devDependencies": { "@types/ws": "^8", "tsx": "^4", "typescript": "^5.9", "vitest": "^3" }
}
```

```ts
// apps/voice-gateway/src/server.ts
import http from "node:http";
import { WebSocketServer } from "ws";
export interface ServerDeps { version: string }
export function createServer(deps: ServerDeps): http.Server {
  const server = http.createServer((req, res) => {
    if (req.url === "/healthz") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: true, service: "voice-gateway", version: deps.version })); return; }
    res.writeHead(404); res.end();
  });
  const wss = new WebSocketServer({ server, path: "/v1/session" });
  wss.on("connection", (ws) => {
    ws.send(JSON.stringify({ type: "error", code: "not_implemented", message: "Voice sessions arrive in Phase 1" }));
    ws.close(1000);
  });
  return server;
}
```

```ts
// apps/voice-gateway/src/server.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { createServer } from "./server.js";
let server: ReturnType<typeof createServer>; let port = 0;
beforeAll(async () => { server = createServer({ version: "test" }); await new Promise<void>((r) => server.listen(0, r)); port = (server.address() as { port: number }).port; });
afterAll(() => new Promise<void>((r) => server.close(() => r())));
describe("voice-gateway", () => {
  it("serves /healthz", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(await res.json()).toEqual({ ok: true, service: "voice-gateway", version: "test" });
  });
  it("accepts a ws upgrade on /v1/session and replies not_implemented", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/v1/session`);
    const msg = await new Promise<string>((r) => ws.once("message", (d) => r(d.toString())));
    expect(JSON.parse(msg)).toMatchObject({ type: "error", code: "not_implemented" });
  });
});
```

`apps/voice-gateway/src/env.ts` is the same shape as the API's with `VOICE_PORT` (default 4100). `index.ts` loads env, logs the mock warning, and listens.

- [ ] **Step 5: Dockerfiles and `.dockerignore`**

```dockerfile
# apps/api/Dockerfile (voice-gateway identical except the workspace name and port)
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
RUN npm ci --workspace @muxaris/api --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/db packages/db
COPY apps/api apps/api
RUN npm run build -w @muxaris/shared && npm run build -w @muxaris/db && npm run build -w @muxaris/api

FROM node:22-alpine
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo/package.json /repo/package-lock.json ./
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/shared/package.json packages/shared/
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/packages/db/package.json packages/db/
COPY --from=build /repo/packages/db/dist packages/db/dist
COPY --from=build /repo/packages/db/drizzle packages/db/drizzle
COPY --from=build /repo/apps/api/package.json apps/api/
COPY --from=build /repo/apps/api/dist apps/api/dist
EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]
```

`.dockerignore`: `node_modules`, `**/node_modules`, `**/dist`, `**/.next`, `cdk.out`, `.env*`, `scripts/spike`.

- [ ] **Step 6: `scripts/dev.sh`**

```bash
#!/usr/bin/env bash
# Start Postgres, run migrations + seed, then run web, api and voice-gateway together.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
[[ -f .env ]] || { echo "copy .env.example to .env first"; exit 1; }
set -a; source .env; set +a
export AWS_PROFILE="aws-secondary-account" AWS_REGION="ap-south-1"
docker compose up -d postgres
until docker exec muxaris-postgres pg_isready -U muxaris >/dev/null 2>&1; do sleep 1; done
npm run db:migrate && npm run db:seed
trap 'kill 0' EXIT
npm run dev -w @muxaris/api &
npm run dev -w @muxaris/voice-gateway &
npm run dev -w @muxaris/web &
wait
```

- [ ] **Step 7: Verify everything**

Run: `npm test && npm run typecheck && npm run build && docker build -f apps/api/Dockerfile -t muxaris-api . && docker run --rm -e DATABASE_URL=postgres://x -p 4000:4000 -d --name mx-api muxaris-api && sleep 2 && curl -s localhost:4000/healthz && docker rm -f mx-api`
Expected: all workspace tests pass; both images build; `{"ok":true,"service":"api",…}`.

- [ ] **Step 8: Commit**

```bash
git add apps/api apps/voice-gateway scripts/dev.sh .dockerignore package-lock.json
git commit -m "feat(api,voice-gateway): service scaffolds with health endpoints, env loading and Dockerfiles

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Asset generation scripts (gpt-image-2 imagery, Sarvam audio)

**Files:**
- Create: `scripts/gen-image.sh`, `scripts/gen-assets.sh`, `scripts/gen-audio.sh`, `docs/BRAND.md`
- Output: `apps/web/public/img/*.webp`, `apps/web/public/audio/*.m4a`

**Interfaces:**
- Produces: `scripts/gen-image.sh "<prompt>" <size> <out.png>`; `scripts/gen-assets.sh` generating the Phase 1 image set; `scripts/gen-audio.sh` generating greeting clips for the five languages plus a stitched sample call. `docs/BRAND.md` records the art direction and every prompt.

- [ ] **Step 1: `gen-image.sh` (ported from svara-ai)**

```bash
#!/usr/bin/env bash
# Usage: scripts/gen-image.sh "<prompt>" <size: 1024x1024|1536x1024|1024x1536> <outfile.png>
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; set -a; source "$ROOT/.env"; set +a
PROMPT="$1"; SIZE="${2:-1024x1024}"; OUT="$3"
BODY=$(jq -n --arg p "$PROMPT" --arg s "$SIZE" '{model:"gpt-image-2", prompt:$p, size:$s, n:1, quality:"high"}')
RESP=$(curl -sS --max-time 300 -X POST "$GPT_IMAGE_ENDPOINT" -H "Content-Type: application/json" -H "api-key: $GPT_IMAGE_API_KEY" -d "$BODY")
ERR=$(echo "$RESP" | jq -r '.error.message // empty'); [[ -n "$ERR" ]] && { echo "ERROR [$OUT]: $ERR" >&2; exit 1; }
mkdir -p "$(dirname "$OUT")"
echo "$RESP" | jq -r '.data[0].b64_json' | base64 -d > "$OUT"
echo "OK $OUT"
```

- [ ] **Step 2: `gen-assets.sh` with the Phase 1 image set**

Art direction (write into `docs/BRAND.md` too): editorial photography feel, warm natural light, real Indian clinic interiors and people, muted palette that sits on `#fafaf7` paper, no text in images, no stock-photo smiles, 35 mm film grain, shallow depth of field. Generate PNG then convert to WebP with `cwebp -q 82` (install via `brew install webp` if missing) or `npx sharp-cli`.

Images (name → prompt summary → size):
- `hero-clinic.png` → a small modern dental clinic reception in Bengaluru, morning light, an empty front desk with a ringing phone implied by a handset slightly lifted, plants, warm wood → 1536x1024
- `step-call.png` → close-up of an Indian woman in her 30s on a phone call outside, looking relieved, city background softly blurred → 1024x1024
- `step-calendar.png` → over-the-shoulder view of a dentist's appointment calendar on a tablet in a clinic, no readable text → 1024x1024
- `step-confirm.png` → a hand holding a phone showing a blurred message confirmation, clinic waiting area behind → 1024x1024
- `spec-dental.png`, `spec-skin.png`, `spec-eye.png`, `spec-physio.png`, `spec-diagnostic.png` → interior details of each clinic type, same grading → 1024x1024
- `og-card.png` → abstract warm paper texture with a soft green sound-wave arc, no text → 1536x1024

- [ ] **Step 3: `gen-audio.sh` (ported, upgraded to bulbul:v3, Muxaris copy)**

Same structure as svara-ai's script: a `tts()` function calling `https://api.sarvam.ai/text-to-speech` with `model: "bulbul:v3"`, `speaker: "anushka"`, `target_language_code`, output WAV; greetings in five languages from the demo seed's `greeting` map ("Sunrise Dental Care" stays, since the demo clinic is the sample); the four-line sample call with caller speaker `vidya` and receptionist `anushka` where the receptionist says "Muxaris" nowhere (she speaks as the clinic); stitch with Python `wave` at 350 ms gaps; encode to AAC m4a via `afconvert`; write to `apps/web/public/audio/`.

- [ ] **Step 4: Run both and check sizes**

Run: `chmod +x scripts/gen-*.sh && scripts/gen-assets.sh && scripts/gen-audio.sh && du -sh apps/web/public/img apps/web/public/audio`
Expected: 11 WebP files under 250 KB each; 6 m4a clips; all playable (`afplay apps/web/public/audio/greet-kn.m4a`).

- [ ] **Step 5: Commit**

```bash
git add scripts/gen-*.sh docs/BRAND.md apps/web/public/img apps/web/public/audio
git commit -m "feat(brand): asset generation scripts and Phase 1 imagery/audio

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Phase 0 exit criteria

- `npm install && npm test && npm run typecheck && npm run build` pass at the root.
- `docker compose up -d && npm run db:migrate && npm run db:seed` work from a clean volume; seed is idempotent.
- `scripts/lib/aws-guard.sh` prints account 005533348545; `MuxarisAuth` stack exists in that account; `.env` has the Cognito ids.
- `docs/SPIKES.md` records working Sarvam STT/TTS parameters and a Bedrock model id that completes a tool call from ap-south-1.
- `apps/web` placeholder, `apps/api` and `apps/voice-gateway` health endpoints run locally via `scripts/dev.sh`; both service Docker images build.
- Brand imagery and audio exist under `apps/web/public/`.
