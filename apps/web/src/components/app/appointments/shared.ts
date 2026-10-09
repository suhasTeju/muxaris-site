import type { Appointment, Doctor } from "@muxaris/shared";
import { formatTime } from "@/lib/dashboard";

/** Doctor colours for doctors saved without one (the design's doctors are teal and violet). */
const PALETTE = ["#0e9a96", "#7b6fd6", "#d98a14", "#e04870", "#2f7de1", "#4a5566"];

export type CalendarDoctor = Pick<Doctor, "id" | "name" | "color" | "active"> & {
  workingHours?: Doctor["workingHours"];
};

/** A 6-digit hex colour for the doctor, so the design's alpha suffixes (`1f`, `14`, `55`) work. */
export function doctorColor(color: string | null | undefined, index: number): string {
  return color && /^#[0-9a-f]{6}$/i.test(color) ? color : PALETTE[index % PALETTE.length]!;
}

/** "MR" for "Dr. Meera Rao", as the column header tile shows it. */
export function doctorInitials(name: string): string {
  return name
    .replace(/^Dr\.?\s+/, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((x) => x[0]!.toUpperCase())
    .join("")
    .slice(0, 3);
}

export const FINAL: ReadonlyArray<Appointment["status"]> = ["cancelled", "completed", "no_show"];

/** The visit is over (its end time has passed). */
export function isPast(a: Pick<Appointment, "endsAt">, now: Date): boolean {
  return Date.parse(a.endsAt) <= now.getTime();
}

/** "10:00 – 10:30 am": the start's am/pm is dropped, as the design's label does. */
export function timeRange(a: Pick<Appointment, "startsAt" | "endsAt">, tz: string): string {
  return `${formatTime(a.startsAt, tz)} – ${formatTime(a.endsAt, tz)}`.replace(
    / (am|pm) – /,
    " – ",
  );
}

export function patientName(a: Pick<Appointment, "patient">): string {
  return a.patient?.name || "Unnamed";
}

export const SOURCE_LABEL: Record<Appointment["source"], string> = {
  ai_call: "Booked by assistant",
  dashboard: "Added from the dashboard",
  web: "Booked on the web",
};
