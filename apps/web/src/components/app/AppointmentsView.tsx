"use client";

import { useCallback, useEffect, useState } from "react";
import type { Appointment, Doctor, Patient, Service } from "@muxaris/shared";
import { useApi } from "@/lib/api-client";
import { addDays, dayRange, localDateKey } from "@/lib/dashboard";
import { AppointmentList } from "./AppointmentList";
import { CancelDialog, NewAppointmentDialog, RescheduleDialog } from "./AppointmentDialogs";
import { DayCalendar } from "./DayCalendar";
import { ghostBtn, primaryBtn } from "./Modal";
import { useClinicProfile } from "./use-clinic-profile";

type Mode = "day" | "week";

export function AppointmentsView() {
  const api = useApi();
  const { tz } = useClinicProfile();
  const [mode, setMode] = useState<Mode>("day");
  const [date, setDate] = useState(() => localDateKey(new Date(), "Asia/Kolkata"));
  const [data, setData] = useState<{
    appointments: Appointment[];
    doctors: Doctor[];
    services: Service[];
    patients: Patient[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState<Appointment | null>(null);
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);

  // Re-anchor "today" once the clinic's real timezone arrives.
  useEffect(() => {
    setDate(localDateKey(new Date(), tz));
  }, [tz]);

  const load = useCallback(async () => {
    setError(null);
    const { from, to } = dayRange(date, mode === "day" ? 1 : 7, tz);
    try {
      const [a, d, s, p] = await Promise.all([
        api<{ appointments: Appointment[] }>(
          `/v1/appointments?${new URLSearchParams({ from, to })}`,
        ),
        api<{ doctors: Doctor[] }>("/v1/doctors"),
        api<{ services: Service[] }>("/v1/services"),
        api<{ patients: Patient[] }>("/v1/patients?limit=200"),
      ]);
      setData({
        appointments: a.appointments,
        doctors: d.doctors,
        services: s.services,
        patients: p.patients,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load appointments");
    }
  }, [api, date, mode, tz]);

  useEffect(() => {
    void load();
  }, [load]);

  const step = mode === "day" ? 1 : 7;
  const days = Array.from({ length: mode === "day" ? 1 : 7 }, (_, i) => addDays(date, i));
  const common = data && {
    appointments: data.appointments,
    doctors: data.doctors,
    services: data.services,
    patients: data.patients,
    tz,
    onCancel: setCancelling,
    onReschedule: setRescheduling,
  };
  const refresh = () => {
    setCreating(false);
    setCancelling(null);
    setRescheduling(null);
    void load();
  };

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl">Appointments</h1>
        <button
          type="button"
          className={primaryBtn}
          onClick={() => setCreating(true)}
          disabled={!data}
        >
          New appointment
        </button>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div
          role="group"
          aria-label="View"
          className="border-line bg-surface flex rounded-xl border p-1"
        >
          {(["day", "week"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={`min-h-9 rounded-lg px-4 text-sm capitalize focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] ${
                mode === m ? "bg-accent text-on-accent" : "text-muted"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={ghostBtn}
          onClick={() => setDate(addDays(date, -step))}
          aria-label="Previous"
        >
          ←
        </button>
        <input
          type="date"
          aria-label="Date"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="border-line bg-surface min-h-11 rounded-xl border px-3"
        />
        <button
          type="button"
          className={ghostBtn}
          onClick={() => setDate(addDays(date, step))}
          aria-label="Next"
        >
          →
        </button>
        <button
          type="button"
          className={ghostBtn}
          onClick={() => setDate(localDateKey(new Date(), tz))}
        >
          Today
        </button>
      </div>

      {error ? (
        <p role="alert" className="text-danger">
          {error}{" "}
          <button type="button" className="underline" onClick={() => void load()}>
            Retry
          </button>
        </p>
      ) : !common ? (
        <p className="text-muted">Loading appointments…</p>
      ) : mode === "day" ? (
        <AppointmentList {...common} />
      ) : (
        <DayCalendar days={days} {...common} />
      )}

      {creating && data && (
        <NewAppointmentDialog
          services={data.services}
          doctors={data.doctors}
          tz={tz}
          defaultDate={date}
          onClose={() => setCreating(false)}
          onDone={refresh}
        />
      )}
      {cancelling && (
        <CancelDialog
          appointment={cancelling}
          tz={tz}
          onClose={() => setCancelling(null)}
          onDone={refresh}
        />
      )}
      {rescheduling && data && (
        <RescheduleDialog
          appointment={rescheduling}
          tz={tz}
          doctorName={
            data.doctors.find((d) => d.id === rescheduling.doctorId)?.name ?? "the doctor"
          }
          onClose={() => setRescheduling(null)}
          onDone={refresh}
        />
      )}
    </div>
  );
}
