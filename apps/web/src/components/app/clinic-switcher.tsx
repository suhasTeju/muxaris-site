"use client";

import { useClinic } from "./clinic-context";

export function ClinicSwitcher() {
  const { clinics, activeClinic, setActiveClinic } = useClinic();
  if (clinics.length < 2) {
    return <span className="font-display text-lg">{activeClinic.name}</span>;
  }
  return (
    <select
      aria-label="Switch clinic"
      value={activeClinic.id}
      onChange={(e) => setActiveClinic(e.target.value)}
      className="border-line bg-surface font-display rounded-lg border px-3 py-1.5 text-base"
    >
      {clinics.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
