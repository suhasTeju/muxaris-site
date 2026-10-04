"use client";

import { useEffect, useState } from "react";
import { useApi } from "@/lib/api-client";
import { formatTime } from "@/lib/dashboard";

export interface Slot {
  doctorId: string;
  startsAt: string;
  endsAt: string;
}

/** Fetches /v1/slots for a service + date and lets the user pick one. */
export function SlotPicker({
  serviceId,
  date,
  doctorId,
  tz,
  doctorNames,
  value,
  onPick,
}: {
  serviceId: string;
  date: string;
  doctorId?: string;
  tz: string;
  doctorNames: Record<string, string>;
  value: Slot | null;
  onPick: (s: Slot) => void;
}) {
  const api = useApi();
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!serviceId || !date) return;
    let live = true;
    setSlots(null);
    setError(null);
    const q = new URLSearchParams({ date, serviceId, ...(doctorId ? { doctorId } : {}) });
    api<{ slots: Slot[] }>(`/v1/slots?${q}`)
      .then((r) => live && setSlots(r.slots))
      .catch(
        (e: unknown) => live && setError(e instanceof Error ? e.message : "Could not load slots"),
      );
    return () => {
      live = false;
    };
  }, [api, serviceId, date, doctorId]);

  if (error)
    return (
      <p role="alert" className="text-danger text-sm">
        {error}
      </p>
    );
  if (!slots) return <p className="text-muted text-sm">Loading free slots…</p>;
  if (slots.length === 0) return <p className="text-muted text-sm">No free slots on this day.</p>;
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Available slots">
      {slots.map((s) => {
        const on = value?.startsAt === s.startsAt && value.doctorId === s.doctorId;
        return (
          <li key={`${s.doctorId}-${s.startsAt}`}>
            <button
              type="button"
              aria-pressed={on}
              onClick={() => onPick(s)}
              className={`min-h-11 w-full rounded-xl border px-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)] ${
                on
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-surface hover:border-accent"
              }`}
            >
              <span className="block font-medium tabular-nums">{formatTime(s.startsAt, tz)}</span>
              {!doctorId && (
                <span className="block truncate text-xs opacity-80">
                  {doctorNames[s.doctorId] ?? ""}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
