"use client";

import { useEffect, useState } from "react";
import { Spinner, cn } from "@/components/ui";
import { formatTime } from "@/lib/dashboard";
import { useCoreApi } from "./core/api";

export interface Slot {
  doctorId: string;
  startsAt: string;
  endsAt: string;
}

interface Result {
  key: string;
  slots?: Slot[];
  error?: string;
}

/**
 * Free-slot grid from the appointment dialogs in AppAppointments.dc.html: fetches /v1/slots for a
 * service + date (optionally one doctor) and shows four columns of time + doctor options.
 * Bump `reloadKey` to fetch again (after a booking conflict, for example).
 */
export function SlotPicker({
  serviceId,
  date,
  doctorId,
  tz,
  doctorNames,
  value,
  onPick,
  reloadKey = 0,
}: {
  serviceId: string;
  date: string;
  doctorId?: string;
  tz: string;
  doctorNames: Record<string, string>;
  value: Slot | null;
  onPick: (s: Slot) => void;
  reloadKey?: number;
}) {
  const api = useCoreApi();
  const key = `${serviceId}|${date}|${doctorId ?? ""}|${reloadKey}`;
  const [result, setResult] = useState<Result | null>(null);
  // Only this request's answer counts; anything older reads as loading.
  const current = result?.key === key ? result : null;

  useEffect(() => {
    if (!serviceId || !date) return;
    let live = true;
    const q = new URLSearchParams({ date, serviceId, ...(doctorId ? { doctorId } : {}) });
    api<{ slots: Slot[] }>(`/v1/slots?${q}`)
      .then((r) => {
        if (live) setResult({ key, slots: r.slots });
      })
      .catch((e: unknown) => {
        if (live)
          setResult({ key, error: e instanceof Error ? e.message : "Could not load slots" });
      });
    return () => {
      live = false;
    };
  }, [api, serviceId, date, doctorId, key]);

  if (!serviceId) {
    return <span className="text-muted-2 text-[13px]">Choose a service to see free times.</span>;
  }
  if (current?.error) {
    return (
      <p role="alert" className="text-rose m-0 text-[13.5px]">
        {current.error}
      </p>
    );
  }
  if (!current?.slots) {
    return (
      <span role="status" className="text-muted flex items-center gap-[8px] text-[13.5px]">
        <Spinner size={14} />
        Loading free slots…
      </span>
    );
  }
  if (current.slots.length === 0) {
    return (
      <span
        role="status"
        className="border-field text-muted rounded-10 border border-dashed p-[12px] text-[13.5px] italic"
      >
        No free slots on this day.
      </span>
    );
  }
  return (
    <div
      role="listbox"
      aria-label="Free slots"
      className="grid max-h-[190px] grid-cols-2 gap-[6px] overflow-auto sm:grid-cols-4"
    >
      {current.slots.map((s) => {
        const on = value?.startsAt === s.startsAt && value.doctorId === s.doctorId;
        const doctor = (doctorNames[s.doctorId] ?? "").replace(/^Dr\. /, "Dr ");
        return (
          <button
            key={`${s.doctorId}-${s.startsAt}`}
            type="button"
            role="option"
            aria-selected={on}
            onClick={() => onPick(s)}
            className={cn(
              "hover:border-teal flex cursor-pointer flex-col items-start gap-[1px] rounded-9 border px-[9px] py-[7px] text-left",
              on ? "border-teal bg-teal" : "border-line bg-surface",
            )}
          >
            <span
              className={cn("font-mono text-[12.5px] font-medium", on ? "text-white" : "text-ink")}
            >
              {formatTime(s.startsAt, tz)}
            </span>
            {doctor ? (
              <span className={cn("text-[11px]", on ? "text-[#d9f5f2]" : "text-muted")}>
                {doctor}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
