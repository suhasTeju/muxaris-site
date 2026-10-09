/**
 * Preview data for the core screens, derived from the design fixtures the way the API would
 * derive it (stats, today's range, names). Development only.
 */
import type { Appointment, Call, PatientDetail } from "@muxaris/shared";
import {
  FIXTURE_NOW,
  FIXTURE_TODAY,
  appointments,
  callbacks,
  calls as seedCalls,
  clinic,
  doctors,
  notifications,
  patients,
  services,
} from "@/components/dev/fixtures";
import { localDateKey, type OverviewStats } from "@/lib/dashboard";

export const TZ = clinic.timezone;
export const NOW = new Date(FIXTURE_NOW);

/** A call as GET /v1/calls returns it: with the linked patient's name joined in. */
export function withPatientName(call: Call): Call {
  const name = call.patientId ? patients.find((p) => p.id === call.patientId)?.name : null;
  return { ...call, patientName: name ?? null };
}
export const calls = seedCalls.map(withPatientName);

export function onDay(key: string): Appointment[] {
  return appointments.filter((a) => localDateKey(a.startsAt, TZ) === key);
}

const today = calls.filter((c) => localDateKey(c.startedAt, TZ) === FIXTURE_TODAY);
export const overviewStats: OverviewStats = {
  date: FIXTURE_TODAY,
  callsToday: today.length,
  bookedToday: today.filter((c) => c.outcome === "booked").length,
  openCallbacks: callbacks.filter((c) => c.status === "open").length,
  openUrgentCallbacks: callbacks.filter((c) => c.status === "open" && c.priority === "urgent")
    .length,
  avgDurationS: today.length
    ? today.reduce((n, c) => n + (c.durationS ?? 0), 0) / today.length
    : null,
  byOutcome: {},
};

export const todayAppointments = { appointments: onDay(FIXTURE_TODAY), doctors, services };

/** `?key=value` from a Next searchParams object. */
export function param(
  q: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const v = q[key];
  return Array.isArray(v) ? v[0] : v;
}

/** GET /v1/patients/:id for a fixture patient, plus its messages (GET /v1/notifications). */
export function patientDetail(id: string) {
  const patient = patients.find((p) => p.id === id);
  if (!patient) return null;
  const detail: PatientDetail = {
    patient,
    appointments: appointments
      .filter((a) => a.patientId === id)
      .sort((a, b) => b.startsAt.localeCompare(a.startsAt)),
    calls: calls
      .filter((c) => c.patientId === id)
      .map(({ id: cid, startedAt, endedAt, durationS, outcome, summary }) => ({
        id: cid,
        startedAt,
        endedAt,
        durationS,
        outcome,
        summary,
      })),
  };
  return { detail, notifications: notifications.filter((n) => n.patientId === id) };
}
