"use client";

import { useId, useState } from "react";
import { indianPhone, type Appointment, type Doctor, type Service } from "@muxaris/shared";
import { Button, Field, Input, Modal, Notice, Select, useToast } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { formatDateTime, formatTime, localDateKey } from "@/lib/dashboard";
import { useCoreApi } from "./core/api";
import { keyDate } from "./core/format";
import { PHONE_ERROR } from "./PatientForm";
import { SlotPicker, type Slot } from "./SlotPicker";

export const CONFLICT = "That slot was just taken. Pick another time.";

/**
 * The slot was taken (or filled up) between showing it and booking it. Other 409s, such as a time
 * that became too soon to book or an appointment that was already finalised, keep their own reason.
 */
export function slotTaken(e: unknown): boolean {
  return (
    e instanceof ApiError &&
    e.code === "slot_unavailable" &&
    (e.reason === "conflict" || e.reason === "full")
  );
}

function errText(e: unknown): string {
  if (slotTaken(e)) return CONFLICT;
  // Server messages start lowercase ("that time is too soon to book").
  const m = e instanceof Error ? e.message : "";
  return m ? m.charAt(0).toUpperCase() + m.slice(1) : "Something went wrong";
}

/** A form submit handler that runs `fn` instead of navigating. */
const onSubmit = (fn: () => void) => (e: React.FormEvent) => {
  e.preventDefault();
  fn();
};

/** Controls sit inside 500-weight #2c3646 labels in the design and inherit both. */
const control = "font-medium text-ink-2";

/** The "Time" label and free-slot grid shared by New appointment and Reschedule. */
function TimeField(props: React.ComponentProps<typeof SlotPicker>) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="flex flex-col gap-[8px]">
      <span id={id} className="text-ink-2 text-[13.5px] font-medium">
        Time
      </span>
      <SlotPicker {...props} />
    </div>
  );
}

function Footer({
  secondary,
  primary,
  busy,
  danger,
  form,
  onClose,
  onConfirm,
}: {
  secondary: string;
  primary: string;
  busy: boolean;
  danger?: boolean;
  /** Submit this form instead of calling onConfirm, so Enter in a field submits too. */
  form?: string;
  onClose: () => void;
  onConfirm?: () => void;
}) {
  return (
    <>
      <Button variant="secondary" size={40} onClick={onClose}>
        {secondary}
      </Button>
      <Button
        variant={danger ? "danger" : "primary"}
        size={40}
        className="shadow-none disabled:opacity-70"
        disabled={busy}
        {...(form ? { type: "submit" as const, form } : { onClick: onConfirm })}
      >
        {primary}
      </Button>
    </>
  );
}

/** New appointment dialog (560): service, date, free slot with doctor, patient phone and name. */
export function NewAppointmentDialog({
  services,
  doctors,
  tz,
  defaultDate,
  onClose,
  onDone,
}: {
  services: Service[];
  doctors: Pick<Doctor, "id" | "name">[];
  tz: string;
  defaultDate: string;
  onClose: () => void;
  /** Called with the booked date (YYYY-MM-DD) so the calendar can show it. */
  onDone: (date: string) => void;
}) {
  const api = useCoreApi();
  const { toast } = useToast();
  const bookable = services.filter((s) => s.active);
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [phone, setPhone] = useState("");
  const [phoneBad, setPhoneBad] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const names = Object.fromEntries(doctors.map((d) => [d.id, d.name]));
  const formId = useId();

  async function submit() {
    if (busy) return;
    if (!slot) return setError("Pick a time.");
    const service = bookable.find((s) => s.id === serviceId);
    if (!service) return setError("Choose a service.");
    if (!indianPhone.safeParse(phone).success) {
      setPhoneBad(true);
      return setError(PHONE_ERROR);
    }
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
      const day = localDateKey(slot.startsAt, tz);
      toast(`Booked ${service.name} for ${keyDate(day)}, ${formatTime(slot.startsAt, tz)}`);
      onDone(day);
    } catch (err) {
      setError(errText(err));
      if (slotTaken(err)) {
        // Someone else took it: drop the pick and show what is still free.
        setSlot(null);
        setReload((n) => n + 1);
      }
      setBusy(false);
    }
  }

  return (
    <Modal
      title="New appointment"
      width={560}
      onClose={onClose}
      footer={
        <Footer
          secondary="Cancel"
          primary={busy ? "Booking…" : "Book appointment"}
          busy={busy}
          form={formId}
          onClose={onClose}
        />
      }
    >
      {/* `contents` keeps the fields as direct items of the dialog body's 16px column. */}
      <form id={formId} noValidate className="contents" onSubmit={onSubmit(submit)}>
        <Field label="Service" variant="lg">
          <Select
            size={42}
            className={control}
            value={serviceId}
            onChange={(e) => {
              setServiceId(e.target.value);
              setSlot(null);
              setError(null);
            }}
          >
            <option value="">Choose a service</option>
            {bookable.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.durationMin} min)
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date" variant="lg">
          <Input
            type="date"
            size={42}
            mono
            className={`${control} px-[10px]`}
            value={date}
            min={localDateKey(new Date(), tz)}
            onChange={(e) => {
              if (!e.target.value) return;
              setDate(e.target.value);
              setSlot(null);
              setError(null);
            }}
          />
        </Field>
        <TimeField
          serviceId={serviceId}
          date={date}
          tz={tz}
          doctorNames={names}
          value={slot}
          reloadKey={reload}
          onPick={(s) => {
            setSlot(s);
            setError(null);
          }}
        />
        <div className="grid grid-cols-1 gap-[12px] sm:grid-cols-2">
          <Field label="Patient phone" variant="lg">
            <Input
              type="tel"
              size={42}
              inputMode="tel"
              autoComplete="off"
              placeholder="+91 98765 43210"
              invalid={phoneBad}
              className={control}
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setPhoneBad(false);
              }}
            />
          </Field>
          <Field label="Patient name (optional)" variant="lg">
            <Input
              size={42}
              autoComplete="off"
              className={control}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
        </div>
        {error ? <Notice>{error}</Notice> : null}
      </form>
    </Modal>
  );
}

/** Reschedule dialog (520): a new date and a free slot with the same doctor. */
export function RescheduleDialog({
  appointment,
  tz,
  doctorName,
  doctorNames = {},
  onClose,
  onDone,
}: {
  appointment: Appointment;
  tz: string;
  doctorName: string;
  /** Doctor names for the slot labels. */
  doctorNames?: Record<string, string>;
  onClose: () => void;
  onDone: (date: string) => void;
}) {
  const api = useCoreApi();
  const { toast } = useToast();
  const [date, setDate] = useState(localDateKey(appointment.startsAt, tz));
  const [slot, setSlot] = useState<Slot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const formId = useId();

  async function confirm() {
    if (busy) return;
    if (!slot) return setError("Pick a time.");
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/appointments/${appointment.id}/reschedule`, {
        method: "PATCH",
        body: { startsAt: slot.startsAt },
      });
      const day = localDateKey(slot.startsAt, tz);
      toast(`Moved to ${keyDate(day)}, ${formatTime(slot.startsAt, tz)}`);
      onDone(day);
    } catch (err) {
      setError(errText(err));
      if (slotTaken(err)) {
        setSlot(null);
        setReload((n) => n + 1);
      }
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Reschedule"
      width={520}
      onClose={onClose}
      footer={
        <Footer
          secondary="Keep current time"
          primary={busy ? "Saving…" : "Confirm new time"}
          busy={busy}
          form={formId}
          onClose={onClose}
        />
      }
    >
      <form id={formId} noValidate className="contents" onSubmit={onSubmit(confirm)}>
        <p className="bg-paper text-ink-2 m-0 rounded-10 px-[12px] py-[10px] text-[14px]">
          Currently {formatDateTime(appointment.startsAt, tz)} with {doctorName}.
        </p>
        <Field label="New date" variant="lg">
          <Input
            type="date"
            size={42}
            mono
            className={`${control} px-[10px]`}
            value={date}
            min={localDateKey(new Date(), tz)}
            onChange={(e) => {
              if (!e.target.value) return;
              setDate(e.target.value);
              setSlot(null);
              setError(null);
            }}
          />
        </Field>
        <TimeField
          serviceId={appointment.serviceId}
          date={date}
          doctorId={appointment.doctorId}
          tz={tz}
          doctorNames={{ [appointment.doctorId]: doctorName, ...doctorNames }}
          value={slot}
          reloadKey={reload}
          onPick={(s) => {
            setSlot(s);
            setError(null);
          }}
        />
        {error ? <Notice>{error}</Notice> : null}
      </form>
    </Modal>
  );
}

/** Cancel dialog (440). */
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
  const api = useCoreApi();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/appointments/${appointment.id}/cancel`, { method: "POST", body: {} });
      toast("Appointment cancelled. The slot is free again.");
      onDone();
    } catch (err) {
      setError(errText(err));
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Cancel appointment?"
      width={440}
      onClose={onClose}
      footer={
        <Footer
          secondary="Keep appointment"
          primary={busy ? "Cancelling…" : "Cancel appointment"}
          busy={busy}
          danger
          onClose={onClose}
          onConfirm={confirm}
        />
      }
    >
      <p className="text-ink-2 m-0 text-[15px] leading-[1.55]">
        The {formatDateTime(appointment.startsAt, tz)} appointment will be cancelled and the slot
        freed.
      </p>
      {error ? <Notice>{error}</Notice> : null}
    </Modal>
  );
}
