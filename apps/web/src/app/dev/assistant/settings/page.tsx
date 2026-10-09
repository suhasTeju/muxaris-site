import { DevAppFrame } from "@/components/dev/DevAppFrame";
import {
  assistantProfile,
  clinic,
  doctors,
  services,
  slotRules,
  usageFor,
} from "@/components/dev/fixtures";
import { SettingsView } from "@/components/app/settings/SettingsView";
import { AutoClick } from "../_preview/AutoClick";

/** Buttons each `?open=` value presses after load (edit modes and the doctor drawer). */
const OPEN: Record<string, string[]> = {
  clinic: ["Edit clinic details"],
  services: ["Edit services"],
  rules: ["Edit booking rules"],
  doctor: ["Edit Dr. Meera Rao"],
  "new-doctor": ["Add doctor"],
};

/**
 * /dev/assistant/settings — Settings with the design's seed data.
 * ?role=front_desk · ?plan=pilot · ?billing=off (no Upgrade button) · ?usage=error
 * · ?empty=1 (no doctors, services or assistant) · ?open=clinic|services|rules|doctor|new-doctor
 */
export default async function SettingsPreview({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const role = q.role === "front_desk" ? "front_desk" : "owner";
  const plan = q.plan === "pilot" ? "pilot" : "standard";
  const empty = q.empty === "1";
  return (
    <DevAppFrame role={role} plan={plan}>
      <SettingsView
        clinic={{ ...clinic, plan }}
        role={role}
        doctors={empty ? [] : doctors}
        services={empty ? [] : services}
        slotRules={slotRules}
        assistant={empty ? null : assistantProfile}
        usage={q.usage === "error" ? null : usageFor(plan)}
        billing={{ enabled: q.billing !== "off" }}
      />
      {q.open && OPEN[q.open] ? <AutoClick names={OPEN[q.open]} /> : null}
    </DevAppFrame>
  );
}
