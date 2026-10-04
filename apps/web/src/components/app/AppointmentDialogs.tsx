"use client";

import { useState } from "react";
import type { Appointment, Doctor, Service } from "@muxaris/shared";
import { ApiError } from "@/lib/api";
import { useApi } from "@/lib/api-client";
import { formatDateTime, localDateKey } from "@/lib/dashboard";
import { Modal, fieldClass, ghostBtn, primaryBtn } from "./Modal";
import { SlotPicker, type Slot } from "./SlotPicker";

function errText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === "conflict") return "That slot was just taken. Pick another time.";
    return e.message;
  }
  return e instanceof Error ? e.message : "Something went wrong";
}

export function NewAppointmentDialog({
  services,
  doctors,
  tz,
  defaultDate,
  onClose,
  onDone,
}: {
  services: Service[];
  doctors: Doctor[];
  tz: string;
  defaultDate: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const api = useApi();
  const bookable = services.filter((s) => s.active);
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const names = Object.fromEntries(doctors.map((d) => [d.id, d.name]));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!slot) return;
    setBusy(true);
    setError(null);
    try {
      await api("/v1/appointments", {
        method: "POST",
        body: {
          startsAt: slot.startsAt,
          doctorId: slot.doctorId,
          serviceId,
          patient: { phone: phone.trim(), ...(name.trim() ? { name: name.trim() } : {}) },
        },
      });
      onDone();
    } catch (err) {
      setError(errText(err));
      setBusy(false);
    }
  }

  return (
    <Modal title="New appointment" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Service
          <select
            required
            className={fieldClass}
            value={serviceId}
            onChange={(e) => {
              setServiceId(e.target.value);
              setSlot(null);
            }}
          >
            <option value="">Choose a service</option>
            {bookable.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.durationMin} min)
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Date
          <input
            type="date"
            required
            className={fieldClass}
            value={date}
            min={localDateKey(new Date(), tz)}
            onChange={(e) => {
              setDate(e.target.value);
              setSlot(null);
            }}
          />
        </label>
        {serviceId && date ? (
          <div>
            <p className="mb-2 text-sm">Time</p>
            <SlotPicker
              serviceId={serviceId}
              date={date}
              tz={tz}
              doctorNames={names}
              value={slot}
              onPick={setSlot}
            />
          </div>
        ) : null}
        <label className="flex flex-col gap-1 text-sm">
          Patient phone
          <input
            required
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="+91 98765 43210"
            className={fieldClass}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Patient name (optional)
          <input
            className={fieldClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
        </label>
        {error && (
          <p role="alert" className="text-danger text-sm">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className={ghostBtn} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={primaryBtn} disabled={!slot || !phone.trim() || busy}>
            {busy ? "Booking…" : "Book appointment"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function RescheduleDialog({
  appointment,
  tz,
  doctorName,
  onClose,
  onDone,
}: {
  appointment: Appointment;
  tz: string;
  doctorName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const api = useApi();
  const [date, setDate] = useState(localDateKey(appointment.startsAt, tz));
  const [slot, setSlot] = useState<Slot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!slot) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/appointments/${appointment.id}/reschedule`, {
        method: "PATCH",
        body: { startsAt: slot.startsAt },
      });
      onDone();
    } catch (err) {
      setError(errText(err));
      setBusy(false);
    }
  }

  return (
    <Modal title="Reschedule appointment" onClose={onClose}>
      <p className="text-muted mb-4 text-sm">
        Currently {formatDateTime(appointment.startsAt, tz)} with {doctorName}.
      </p>
      <label className="mb-4 flex flex-col gap-1 text-sm">
        New date
        <input
          type="date"
          className={fieldClass}
          value={date}
          min={localDateKey(new Date(), tz)}
          onChange={(e) => {
            setDate(e.target.value);
            setSlot(null);
          }}
        />
      </label>
      <SlotPicker
        serviceId={appointment.serviceId}
        date={date}
        doctorId={appointment.doctorId}
        tz={tz}
        doctorNames={{}}
        value={slot}
        onPick={setSlot}
      />
      {error && (
        <p role="alert" className="text-danger mt-3 text-sm">
          {error}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className={ghostBtn} onClick={onClose}>
          Keep current time
        </button>
        <button type="button" className={primaryBtn} disabled={!slot || busy} onClick={confirm}>
          {busy ? "Saving…" : "Confirm new time"}
        </button>
      </div>
    </Modal>
  );
}

export function CancelDialog({
  appointment,
  tz,
  onClose,
  onDone,
}: {
  appointment: Appointment;
  tz: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/appointments/${appointment.id}/cancel`, { method: "POST", body: {} });
      onDone();
    } catch (err) {
      setError(errText(err));
      setBusy(false);
    }
  }
  return (
    <Modal title="Cancel appointment?" onClose={onClose}>
      <p className="mb-4 text-[15px]">
        The {formatDateTime(appointment.startsAt, tz)} appointment will be cancelled and the slot
        freed.
      </p>
      {error && (
        <p role="alert" className="text-danger mb-3 text-sm">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className={ghostBtn} onClick={onClose}>
          Keep appointment
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={confirm}
          className="bg-danger inline-flex min-h-11 items-center rounded-xl px-5 text-[15px] font-medium text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-danger)]"
        >
          {busy ? "Cancelling…" : "Cancel appointment"}
        </button>
      </div>
    </Modal>
  );
}
