/**
 * In-memory stand-in for the API, answering the requests the core screens make in the browser.
 * Development only: it backs the /dev/core previews through ApiFetcherProvider.
 */
import {
  maskPhone,
  type Appointment,
  type Call,
  type Patient,
  type PatientDetail,
} from "@muxaris/shared";
import type { ApiFetcher } from "@/components/app/core/api";
import {
  FIXTURE_NOW,
  appointments as seedAppointments,
  callTurns,
  callbacks,
  calls as seedCalls,
  clinic,
  doctors,
  notifications,
  patientPhones,
  patients as seedPatients,
  services,
  slotRules,
} from "@/components/dev/fixtures";
import { ApiError, type ApiInit } from "@/lib/api";
import { localDateKey } from "@/lib/dashboard";

export interface FixtureOptions {
  /** Answer every request with this error (status 500 unless given). */
  fail?: boolean;
  /** Delay before answering, in ms (the prototype's slot spinner is 450 ms). */
  delayMs?: number;
  /** recording-url answers: ready (default), pending (409), missing (404) or error (500). */
  recording?: "ready" | "pending" | "missing" | "error";
  /** The first booking on the first slot fails with a conflict, as the prototype demonstrates. */
  conflictOnce?: boolean;
  /** Start with no appointments (the empty calendar). */
  empty?: boolean;
}

const TZ = clinic.timezone;
const now = () => Date.parse(FIXTURE_NOW);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Wall-clock minutes of the day in IST, and the UTC instant for a date + minutes. */
const IST_MS = 330 * 60_000;
const minutesOf = (iso: string) => {
  const d = new Date(Date.parse(iso) + IST_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};
const at = (date: string, minutes: number) =>
  new Date(Date.parse(`${date}T00:00:00+05:30`) + minutes * 60_000).toISOString();

/** A silent mono WAV of `seconds`, so the recording player has something to play. */
let silence: { seconds: number; url: string } | null = null;
function silentWav(seconds: number): string {
  if (silence?.seconds === seconds) return silence.url;
  const rate = 8000;
  const n = Math.max(1, Math.round(seconds * rate));
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const str = (o: number, s: string) =>
    [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + n, true);
  str(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  str(36, "data");
  v.setUint32(40, n, true);
  new Uint8Array(buf, 44).fill(128);
  const url = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
  silence = { seconds, url };
  return url;
}

export function createFixtureApi(opts: FixtureOptions = {}): ApiFetcher {
  const db = {
    appointments: opts.empty ? [] : clone(seedAppointments),
    patients: clone(seedPatients),
    calls: clone(seedCalls),
  };
  let conflictPending = !!opts.conflictOnce;
  let seq = 100;

  const patientOf = (id: string) => db.patients.find((p) => p.id === id);
  const withPatient = (a: Appointment): Appointment => {
    const p = patientOf(a.patientId);
    return p ? { ...a, patient: { name: p.name, phoneMasked: p.phoneMasked } } : a;
  };
  /** GET /v1/calls and /v1/calls/:id join the linked patient's name. */
  const withPatientName = (c: Call): Call => ({
    ...c,
    patientName: (c.patientId ? patientOf(c.patientId)?.name : null) ?? null,
  });

  function slots(q: URLSearchParams) {
    const date = q.get("date") ?? "";
    const svc = services.find((s) => s.id === q.get("serviceId"));
    const doctorId = q.get("doctorId");
    const excludeId = q.get("excludeAppointmentId");
    const weekday = new Date(`${date}T12:00:00+05:30`).getUTCDay();
    const today = localDateKey(new Date(now()), TZ);
    if (!svc || weekday === 0 || date < today) return [];
    const minStart = date === today ? minutesOf(FIXTURE_NOW) + slotRules.leadTimeMin : 0;
    const out: Array<{ doctorId: string; startsAt: string; endsAt: string }> = [];
    for (let t = 600; t + svc.durationMin <= 1200; t += slotRules.slotGrainMin) {
      if (t < minStart) continue;
      for (const d of doctors) {
        if (!d.active || (doctorId && d.id !== doctorId)) continue;
        const clash = db.appointments.some((a) => {
          if (a.id === excludeId || a.doctorId !== d.id || a.status === "cancelled") return false;
          if (localDateKey(a.startsAt, TZ) !== date) return false;
          const s = minutesOf(a.startsAt);
          const len = (Date.parse(a.endsAt) - Date.parse(a.startsAt)) / 60_000;
          return t < s + len + 10 && s < t + svc.durationMin + svc.bufferMin;
        });
        if (!clash) {
          out.push({
            doctorId: d.id,
            startsAt: at(date, t),
            endsAt: at(date, t + svc.durationMin),
          });
        }
      }
    }
    return out.slice(0, 32);
  }

  function patientDetail(id: string): PatientDetail {
    const patient = patientOf(id);
    if (!patient) throw new ApiError(404, "not_found", "Patient not found");
    return {
      patient,
      appointments: db.appointments
        .filter((a) => a.patientId === id)
        .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
        .map(withPatient),
      calls: db.calls
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
  }

  function route(method: string, path: string, body: Record<string, unknown>): unknown {
    const url = new URL(path, "http://fixture");
    const q = url.searchParams;
    const parts = url.pathname.split("/").filter(Boolean).slice(1); // drop "v1"
    const [head, id, sub] = parts;

    if (head === "clinics") return { clinic };
    if (head === "doctors") return { doctors };
    if (head === "services") return { services };
    if (head === "slots") return { slots: slots(q) };

    if (head === "appointments") {
      if (!id && method === "GET") {
        const from = q.get("from") ?? "";
        const to = q.get("to") ?? "￿";
        return {
          appointments: db.appointments
            .filter((a) => a.startsAt >= from && a.startsAt < to)
            .map(withPatient),
        };
      }
      if (!id && method === "POST") {
        const slot = body as { startsAt: string; doctorId: string; serviceId: string };
        const first = slots(
          new URLSearchParams({
            date: localDateKey(slot.startsAt, TZ),
            serviceId: slot.serviceId,
          }),
        )[0];
        if (conflictPending && first?.startsAt === slot.startsAt) {
          conflictPending = false;
          throw new ApiError(
            409,
            "slot_unavailable",
            "that time is no longer available",
            undefined,
            "conflict",
          );
        }
        const p = (body as { patient: { phone: string; name?: string } }).patient;
        const digits = p.phone.replace(/\D/g, "").slice(-10);
        let patient = db.patients.find((x) =>
          (patientPhones[x.id] ?? "").replace(/\D/g, "").endsWith(digits),
        );
        if (!patient) {
          patient = {
            ...clone(seedPatients[0]!),
            id: `p${++seq}`,
            name: p.name ?? null,
            email: null,
            dob: null,
            notes: null,
            phoneMasked: maskPhone(`+91${digits}`),
            createdAt: FIXTURE_NOW,
            updatedAt: FIXTURE_NOW,
          };
          db.patients.unshift(patient);
        }
        const svc = services.find((s) => s.id === slot.serviceId)!;
        const appointment: Appointment = {
          ...clone(seedAppointments[0]!),
          id: `a${++seq}`,
          patientId: patient.id,
          doctorId: slot.doctorId,
          serviceId: svc.id,
          startsAt: slot.startsAt,
          endsAt: new Date(Date.parse(slot.startsAt) + svc.durationMin * 60_000).toISOString(),
          status: "scheduled",
          source: "dashboard",
          createdByCallId: null,
          createdAt: FIXTURE_NOW,
          updatedAt: FIXTURE_NOW,
        };
        db.appointments.push(appointment);
        return { appointment: withPatient(appointment) };
      }
      const a = db.appointments.find((x) => x.id === id);
      if (!a) throw new ApiError(404, "not_found", "Appointment not found");
      if (sub === "reschedule") {
        const len = Date.parse(a.endsAt) - Date.parse(a.startsAt);
        a.startsAt = String(body.startsAt);
        a.endsAt = new Date(Date.parse(a.startsAt) + len).toISOString();
        a.status = "rescheduled";
      } else if (sub === "cancel") a.status = "cancelled";
      else if (sub === "status") a.status = body.status as Appointment["status"];
      return { appointment: withPatient(a) };
    }

    if (head === "patients") {
      if (!id && method === "GET") {
        const term = (q.get("q") ?? "").toLowerCase();
        const digits = term.replace(/\D/g, "");
        const list = db.patients.filter(
          (p) =>
            !term ||
            (p.name ?? "").toLowerCase().includes(term) ||
            (p.email ?? "").toLowerCase().includes(term) ||
            (digits.length > 2 && (patientPhones[p.id] ?? "").includes(digits)),
        );
        const offset = Number(q.get("offset") ?? 0);
        const limit = Number(q.get("limit") ?? 50);
        return { patients: list.slice(offset, offset + limit), total: list.length };
      }
      if (!id && method === "POST") {
        const b = body as Partial<Patient> & { phone: string };
        const patient: Patient = {
          ...clone(seedPatients[0]!),
          id: `p${++seq}`,
          name: b.name ?? null,
          email: b.email ?? null,
          dob: b.dob ?? null,
          notes: b.notes ?? null,
          preferredLanguage: b.preferredLanguage ?? "en-IN",
          phoneMasked: maskPhone(b.phone),
          createdAt: FIXTURE_NOW,
          updatedAt: FIXTURE_NOW,
        };
        db.patients.unshift(patient);
        return { patient };
      }
      const p = patientOf(id!);
      if (!p) throw new ApiError(404, "not_found", "Patient not found");
      if (sub === "reveal-phone") return { phone: patientPhones[p.id] ?? "+919000000000" };
      if (method === "PATCH") {
        Object.assign(p, body, { updatedAt: FIXTURE_NOW });
        return { patient: p };
      }
      return patientDetail(p.id);
    }

    if (head === "notifications") {
      if (id && sub === "retry" && method === "POST") {
        const n = notifications.find((x) => x.id === id);
        if (!n) throw new ApiError(404, "not_found", "Notification not found");
        return {
          notification: {
            ...n,
            status: "queued",
            error: null,
            nextAttemptAt: new Date().toISOString(),
          },
        };
      }
      const pid = q.get("patientId");
      return { notifications: notifications.filter((n) => !pid || n.patientId === pid) };
    }

    if (head === "calls") {
      if (!id) {
        let list = db.calls;
        const outcome = q.get("outcome");
        const status = q.get("status");
        if (outcome) list = list.filter((c) => c.outcome === outcome);
        if (status) list = list.filter((c) => c.status === status);
        const offset = Number(q.get("offset") ?? 0);
        return {
          calls: list.slice(offset, offset + Number(q.get("limit") ?? 50)).map(withPatientName),
          total: list.length,
        };
      }
      const call = db.calls.find((c) => c.id === id);
      if (!call) throw new ApiError(404, "not_found", "Call not found");
      if (sub === "recording-url") {
        const r = opts.recording ?? "ready";
        if (r === "pending") throw new ApiError(409, "recording_pending", "Recording pending");
        if (r === "missing") throw new ApiError(404, "not_found", "No recording");
        if (r === "error") throw new ApiError(500, "internal", "Recording service failed");
        return { url: silentWav(call.durationS ?? 30), expiresInS: 600 };
      }
      if (method === "PATCH") {
        Object.assign(call, body, { outcomeSource: "staff" });
        // Like the API: PATCH returns the bare row, without the joined name.
        return { call };
      }
      return {
        call: withPatientName(call),
        turns: callTurns[call.id] ?? [],
        callbacks: callbacks.filter((c) => c.callId === call.id),
      };
    }
    throw new ApiError(404, "not_found", `No fixture for ${method} ${url.pathname}`);
  }

  return async <T>(path: string, init?: ApiInit): Promise<T> => {
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    if (opts.fail) throw new ApiError(500, "internal", "Something went wrong");
    const body = (init?.body ?? {}) as Record<string, unknown>;
    return clone(route(init?.method ?? "GET", path, body)) as T;
  };
}
