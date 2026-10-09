import type { Call, Patient } from "@muxaris/shared";
import { MonitorSmartphone, PhoneIncoming, PhoneMissed, type LucideIcon } from "lucide-react";

/** Patient id → name, for showing who called (call rows carry only the patient id). */
export type PatientNames = Record<string, string>;

/** The name map from a patients page (unnamed patients are left out). */
export function patientNamesFrom(list: Pick<Patient, "id" | "name">[]): PatientNames {
  return Object.fromEntries(list.flatMap((p) => (p.name ? [[p.id, p.name] as const] : [])));
}

/** Who the design names on a call row: "Test call", the patient's name, or the masked number. */
export function callerOf(
  call: Pick<Call, "channel" | "patientId" | "callerPhoneMasked">,
  names?: PatientNames,
): { who: string; sub: string; test: boolean; named: boolean } {
  const test = call.channel === "browser";
  const name = call.patientId ? names?.[call.patientId] : undefined;
  if (test) return { who: "Test call", sub: "", test, named: false };
  if (name) return { who: name, sub: call.callerPhoneMasked ?? "", test, named: true };
  return { who: call.callerPhoneMasked ?? "Unknown caller", sub: "", test, named: false };
}

/** The row's icon tile: browser test calls, missed (abandoned) calls, everything else. */
export function callIcon(call: Pick<Call, "channel" | "outcome">): {
  icon: LucideIcon;
  tile: string;
} {
  if (call.channel === "browser") return { icon: MonitorSmartphone, tile: "bg-chip text-ink-3" };
  return {
    icon: call.outcome === "abandoned" ? PhoneMissed : PhoneIncoming,
    tile: "bg-teal-soft text-teal-ink",
  };
}
