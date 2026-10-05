import type { schema } from "@muxaris/db";

type AppointmentStatus = (typeof schema.appointments.$inferSelect)["status"];

/** Statuses in which an appointment can still change and still warrants patient messages. */
export const ACTIVE_APPOINTMENT_STATUSES: readonly AppointmentStatus[] = [
  "scheduled",
  "confirmed",
  "rescheduled",
];

export function isActiveAppointmentStatus(status: AppointmentStatus): boolean {
  return ACTIVE_APPOINTMENT_STATUSES.includes(status);
}
