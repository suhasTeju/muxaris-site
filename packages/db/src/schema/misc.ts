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
