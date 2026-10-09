"use client";

import { useClinic } from "./clinic-context";

/** Clinic name in the header, or a "Switch clinic" select when the user belongs to several. */
export function ClinicSwitcher() {
  const { clinics, activeClinic, setActiveClinic } = useClinic();
  if (clinics.length < 2) {
    return (
      <span className="truncate text-[14.5px] font-semibold whitespace-nowrap">
        {activeClinic.name}
      </span>
    );
  }
  return (
    <label className="flex min-w-0 items-center gap-[8px]">
      <span className="sr-only">Switch clinic</span>
      <select
        aria-label="Switch clinic"
        value={activeClinic.id}
        onChange={(e) => setActiveClinic(e.target.value)}
        className="border-field bg-surface text-ink h-[34px] max-w-full min-w-0 rounded-9 border px-[10px] text-[14px] font-semibold"
      >
        {clinics.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
