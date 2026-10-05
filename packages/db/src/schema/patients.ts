import { pgTable, text, timestamp, date, uniqueIndex } from "drizzle-orm/pg-core";
import { clinics } from "./tenancy.js";
export const patients = pgTable(
  "patients",
  {
    id: text("id").primaryKey(),
    clinicId: text("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    phone: text("phone").notNull(),
    name: text("name"),
    preferredLanguage: text("preferred_language").notNull().default("en-IN"),
    dob: date("dob"),
    notes: text("notes"),
    email: text("email"),
    consentAt: timestamp("consent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("patients_clinic_phone_idx").on(t.clinicId, t.phone)],
);
