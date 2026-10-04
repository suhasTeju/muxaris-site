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
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    cognitoSub: text("cognito_sub").notNull().unique(),
    email: text("email").notNull(),
    name: text("name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clinicId: text("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    status: membershipStatusEnum("status").notNull().default("active"),
    invitedBy: text("invited_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("memberships_user_clinic_idx").on(t.userId, t.clinicId),
    index("memberships_clinic_idx").on(t.clinicId),
  ],
);

export const invitations = pgTable("invitations", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id")
    .notNull()
    .references(() => clinics.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: roleEnum("role").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
