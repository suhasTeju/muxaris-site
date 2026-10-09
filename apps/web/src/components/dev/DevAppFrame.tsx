import type { Role, UsageSummary } from "@muxaris/shared";
import { AppShell } from "@/components/app/AppShell";
import { ClinicProvider, type ClinicSummary } from "@/components/app/clinic-context";
import { FIXTURE_EMAIL, clinic, openCallbacksCount, secondClinic, usageFor } from "./fixtures";

export interface DevAppFrameProps {
  /** Signed-in role: changes the header chip and email (and whatever the page hides for front desk). */
  role?: Role;
  /** Plan for the sidebar minutes card: standard 1,842 / 3,000; pilot 462 / 500, ends 25 Oct 2026. */
  plan?: "standard" | "pilot";
  /** Two clinics, so the header shows the "Switch clinic" select. */
  multiClinic?: boolean;
  /** Callbacks badge in the sidebar (default 3, the fixture's open callbacks). */
  openCallbacks?: number;
  /** Override the sidebar usage; `null` shows the "Couldn't load usage" state. */
  usage?: UsageSummary | null;
  children: React.ReactNode;
}

/**
 * Development-only: the real signed-in shell (`AppShell`) around fixture clinic context, with no
 * network calls. It passes fixture values through the same props the `(app)` layout passes and
 * turns off the sidebar's API refresh. Use it in preview pages under `app/dev/*`:
 *
 *   <DevAppFrame role="front_desk" plan="pilot"><CallsView calls={calls} … /></DevAppFrame>
 *
 * Switching clinics in the select writes the real clinic cookie and refreshes, like the app does;
 * the frame still shows the fixture clinic.
 */
export function DevAppFrame({
  role = "owner",
  plan = "standard",
  multiClinic = false,
  openCallbacks = openCallbacksCount,
  usage,
  children,
}: DevAppFrameProps) {
  const clinics: ClinicSummary[] = [clinic, ...(multiClinic ? [secondClinic] : [])].map((c) => ({
    id: c.id,
    name: c.name,
    role,
  }));
  return (
    <ClinicProvider clinics={clinics} activeId={clinic.id} cookieStale={false}>
      <AppShell
        email={FIXTURE_EMAIL[role]}
        usage={usage === undefined ? usageFor(plan) : usage}
        openCallbacks={openCallbacks}
        refresh={false}
      >
        {children}
      </AppShell>
    </ClinicProvider>
  );
}
