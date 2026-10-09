"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { Appointment, Doctor, Service } from "@muxaris/shared";
import {
  Button,
  EmptyState,
  Input,
  PageHeader,
  Segmented,
  Spinner,
  useToast,
} from "@/components/ui";
import { addDays, dayRange, localDateKey } from "@/lib/dashboard";
import { CancelDialog, NewAppointmentDialog, RescheduleDialog } from "../AppointmentDialogs";
import { useCoreApi } from "../core/api";
import { keyDateLong, keyDayShort, keyWeekdayIndex } from "../core/format";
import { PAGE_TITLE_MOBILE } from "../core/layout";
import { AppointmentDrawer } from "./AppointmentDrawer";
import { DayTimeline } from "./DayTimeline";
import { WeekGrid, mondayOf } from "./WeekGrid";
import { doctorColor } from "./shared";

export type CalendarMode = "day" | "week";
type DialogState =
  | { kind: "new" }
  | { kind: "reschedule"; appointment: Appointment }
  | { kind: "cancel"; appointment: Appointment }
  | null;

interface Loaded {
  key: string;
  appointments: Appointment[];
  doctors: Doctor[];
  services: Service[];
}

const MODES = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
];

function Problem({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <p role="alert" className="text-rose m-0 flex items-center gap-[10px] text-[14px]">
      {text}
      <Button variant="secondary" size={30} onClick={onRetry}>
        Retry
      </Button>
    </p>
  );
}

/**
 * Appointments page from AppAppointments.dc.html: Day / Week toggle, date navigation, the doctor
 * timeline or week grid, the appointment drawer and the New / Reschedule / Cancel dialogs.
 * `ready` is false until the clinic's timezone is known; nothing is fetched before then.
 */
export function AppointmentsBoard({
  tz,
  ready = true,
  profileError,
  onRetryProfile,
  now: fixedNow,
  initialDate,
  initialMode = "day",
  initialId,
  initialDialog,
}: {
  tz: string;
  ready?: boolean;
  /** The clinic profile failed to load: show this with a Retry instead of loading forever. */
  profileError?: string | null;
  onRetryProfile?: () => void;
  /** Pin "now" (dev previews); otherwise the clock, refreshed every minute. */
  now?: Date;
  initialDate?: string;
  initialMode?: CalendarMode;
  /** Open this appointment's drawer once it is loaded (links from the Overview). */
  initialId?: string;
  /** Open a dialog on load (dev previews): "new", or "reschedule" / "cancel" for initialId. */
  initialDialog?: "new" | "reschedule" | "cancel";
}) {
  const api = useCoreApi();
  const { toast } = useToast();
  const [clock, setClock] = useState(() => fixedNow ?? new Date());
  const now = fixedNow ?? clock;
  useEffect(() => {
    if (fixedNow) return;
    const id = setInterval(() => setClock(new Date()), 60_000);
    return () => clearInterval(id);
  }, [fixedNow]);

  const today = localDateKey(now, tz);
  const [mode, setMode] = useState<CalendarMode>(initialMode);
  // null means "today in the clinic's timezone".
  const [picked, setPicked] = useState<string | null>(initialDate ?? null);
  const date = picked ?? today;
  const monday = mondayOf(date, keyWeekdayIndex(date));
  const rangeStart = mode === "day" ? date : monday;
  const rangeKey = `${rangeStart}|${mode}|${tz}`;

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<{ key: string; text: string } | null>(null);
  const [nonce, setNonce] = useState(0);
  // Rows from another date or mode must not sit under the new header while the response is in flight.
  const data = loaded && loaded.key === rangeKey ? loaded : null;
  const loadError = error && error.key === `${rangeKey}|${nonce}` ? error.text : null;

  const [selectedId, setSelectedId] = useState<string | null>(initialId ?? null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [pendingDialog, setPendingDialog] = useState(initialDialog);
  const outcomeBusy = useRef(new Set<string>());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [outcomeError, setOutcomeError] = useState<string | null>(null);

  // Only the latest request may write state; wait for the clinic profile (timezone) first.
  useEffect(() => {
    if (!ready) return;
    let live = true;
    const { from, to } = dayRange(rangeStart, mode === "day" ? 1 : 7, tz);
    const attempt = `${rangeKey}|${nonce}`;
    Promise.all([
      api<{ appointments: Appointment[] }>(`/v1/appointments?${new URLSearchParams({ from, to })}`),
      api<{ doctors: Doctor[] }>("/v1/doctors"),
      api<{ services: Service[] }>("/v1/services"),
    ])
      .then(([a, d, s]) => {
        if (!live) return;
        setLoaded({
          key: rangeKey,
          appointments: a.appointments,
          doctors: d.doctors,
          services: s.services,
        });
      })
      .catch((e: unknown) => {
        if (live) {
          setError({
            key: attempt,
            text: e instanceof Error ? e.message : "Could not load appointments",
          });
        }
      });
    return () => {
      live = false;
    };
  }, [api, rangeStart, mode, tz, ready, nonce, rangeKey]);

  const reload = () => setNonce((n) => n + 1);
  const selected = data?.appointments.find((a) => a.id === selectedId) ?? null;

  // A dialog asked for on load (dev previews) opens once its data is here.
  if (pendingDialog && data && (pendingDialog === "new" || selected)) {
    setPendingDialog(undefined);
    setDialog(
      pendingDialog === "new" || !selected
        ? { kind: "new" }
        : { kind: pendingDialog, appointment: selected },
    );
  }

  const serviceNames = Object.fromEntries((data?.services ?? []).map((s) => [s.id, s.name]));
  const doctorIndex = new Map((data?.doctors ?? []).map((d, i) => [d.id, i]));

  async function outcome(a: Appointment, status: "completed" | "no_show") {
    if (outcomeBusy.current.has(a.id)) return;
    outcomeBusy.current.add(a.id);
    setBusyId(a.id);
    setOutcomeError(null);
    try {
      const r = await api<{ appointment: Appointment }>(
        `/v1/appointments/${encodeURIComponent(a.id)}/status`,
        { method: "POST", body: { status } },
      );
      setLoaded((prev) =>
        prev
          ? {
              ...prev,
              appointments: prev.appointments.map((x) => (x.id === a.id ? r.appointment : x)),
            }
          : prev,
      );
      toast(status === "completed" ? "Marked as completed" : "Marked as no-show");
    } catch (e) {
      setOutcomeError(e instanceof Error ? e.message : "Could not update the appointment");
    } finally {
      outcomeBusy.current.delete(a.id);
      setBusyId(null);
    }
  }

  const step = mode === "day" ? 1 : 7;
  const sunday = addDays(monday, 6);
  const subtitle =
    mode === "day"
      ? keyDateLong(date)
      : `${keyDayShort(monday)} – ${keyDayShort(sunday)} ${sunday.slice(0, 4)}`;

  let body: React.ReactNode;
  if (profileError !== undefined && profileError !== null && !ready) {
    body = <Problem text={profileError} onRetry={() => onRetryProfile?.()} />;
  } else if (loadError) {
    body = <Problem text={loadError} onRetry={reload} />;
  } else if (!data || !ready) {
    body = (
      <p className="text-muted m-0 flex items-center gap-[8px] text-[14px]">
        <Spinner size={14} />
        Loading appointments…
      </p>
    );
  } else if (mode === "day") {
    body =
      data.appointments.length === 0 ? (
        <EmptyState>
          {date === today ? "No appointments today." : "No appointments on this day."} Your
          assistant will book them as calls come in.
        </EmptyState>
      ) : (
        <DayTimeline
          date={date}
          appointments={data.appointments}
          doctors={data.doctors}
          serviceNames={serviceNames}
          tz={tz}
          now={now}
          today={today}
          onOpen={(a) => setSelectedId(a.id)}
        />
      );
  } else {
    body = (
      <WeekGrid
        monday={monday}
        appointments={data.appointments}
        doctors={data.doctors}
        serviceNames={serviceNames}
        tz={tz}
        today={today}
        onOpen={(a) => setSelectedId(a.id)}
      />
    );
  }

  const doctorOf = (a: Appointment) => data?.doctors.find((d) => d.id === a.doctorId);
  const after = (day?: string) => {
    setDialog(null);
    setSelectedId(null);
    if (day) setPicked(day);
    reload();
  };

  return (
    <div className="animate-mx-in flex flex-col gap-[18px]">
      <PageHeader
        className={PAGE_TITLE_MOBILE}
        title="Appointments"
        subtitle={subtitle}
        actions={
          <Button icon={Plus} disabled={!data} onClick={() => setDialog({ kind: "new" })}>
            New appointment
          </Button>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-[12px]">
        <Segmented
          aria-label="View"
          items={MODES}
          value={mode}
          onChange={(id) => setMode(id as CalendarMode)}
        />
        <div className="flex items-center gap-[8px]">
          <Button
            variant="secondary"
            size={34}
            iconOnly
            icon={ChevronLeft}
            iconSize={16}
            aria-label="Previous"
            onClick={() => setPicked(addDays(date, -step))}
          />
          <Button
            variant="secondary"
            size={34}
            iconOnly
            icon={ChevronRight}
            iconSize={16}
            aria-label="Next"
            onClick={() => setPicked(addDays(date, step))}
          />
          <Input
            type="date"
            aria-label="Date"
            size={34}
            mono
            className="w-auto rounded-9 px-[10px]"
            value={date}
            onChange={(e) => e.target.value && setPicked(e.target.value)}
          />
          <Button variant="secondary" size={34} onClick={() => setPicked(null)}>
            Today
          </Button>
        </div>
      </div>
      {body}

      {selected && !dialog ? (
        <AppointmentDrawer
          appointment={selected}
          serviceName={serviceNames[selected.serviceId] ?? "Appointment"}
          doctorName={doctorOf(selected)?.name ?? "Unassigned"}
          doctorColor={doctorColor(
            doctorOf(selected)?.color,
            doctorIndex.get(selected.doctorId) ?? 0,
          )}
          tz={tz}
          now={now}
          busy={busyId === selected.id}
          error={outcomeError}
          onClose={() => {
            setSelectedId(null);
            setOutcomeError(null);
          }}
          onReschedule={() => setDialog({ kind: "reschedule", appointment: selected })}
          onCancel={() => setDialog({ kind: "cancel", appointment: selected })}
          onOutcome={(status) => outcome(selected, status)}
        />
      ) : null}
      {dialog?.kind === "new" && data ? (
        <NewAppointmentDialog
          services={data.services}
          doctors={data.doctors}
          tz={tz}
          defaultDate={date < today ? today : date}
          onClose={() => setDialog(null)}
          onDone={(day) => after(day)}
        />
      ) : null}
      {dialog?.kind === "reschedule" && data ? (
        <RescheduleDialog
          appointment={dialog.appointment}
          tz={tz}
          doctorName={doctorOf(dialog.appointment)?.name ?? "the doctor"}
          onClose={() => setDialog(null)}
          onDone={(day) => after(day)}
        />
      ) : null}
      {dialog?.kind === "cancel" ? (
        <CancelDialog
          appointment={dialog.appointment}
          tz={tz}
          onClose={() => setDialog(null)}
          onDone={() => after()}
        />
      ) : null}
    </div>
  );
}
