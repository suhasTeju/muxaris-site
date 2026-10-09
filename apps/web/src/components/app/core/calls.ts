import type { Call } from "@muxaris/shared";
import { MonitorSmartphone, PhoneIncoming, PhoneMissed, type LucideIcon } from "lucide-react";

/**
 * Who the design names on a call row: "Test call", the linked patient's name (the API joins it in
 * as `patientName`), or the masked number.
 */
export function callerOf(call: Pick<Call, "channel" | "patientName" | "callerPhoneMasked">): {
  who: string;
  sub: string;
  test: boolean;
  named: boolean;
} {
  const test = call.channel === "browser";
  if (test) return { who: "Test call", sub: "", test, named: false };
  if (call.patientName)
    return { who: call.patientName, sub: call.callerPhoneMasked ?? "", test, named: true };
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
