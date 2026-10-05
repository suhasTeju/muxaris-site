import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { clinics } from "./tenancy.js";

/** A dialled number routed to a clinic ("pn_…" via newId("pn")). */
export const phoneNumbers = pgTable(
  "phone_numbers",
  {
    id: text("id").primaryKey(),
    clinicId: text("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    e164: text("e164").notNull().unique(),
    provider: text("provider").notNull(), // "twilio" | "exotel"
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("phone_numbers_clinic_idx").on(t.clinicId)],
);
