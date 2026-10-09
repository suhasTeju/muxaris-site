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
  /**
   * Stream the minutes and the badge as promises that resolve after this many ms, the way the
   * `(app)` layout does, to preview the loading state.
   */
  streamDelayMs?: number;
  children: React.ReactNode;
}

function later<T>(value: T, ms: number | undefined): T | Promise<T> {
  return ms === undefined ? value : new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/**
 * Development-only: the real signed-in shell (`AppShell`) around fixture clinic context, with no
 * network calls. It passes fixture values through the same props the `(app)` layout passes (plain
 * values where the layout streams promises); the sidebar only refetches on a client navigation a
 * minute later, and its links leave the preview. Use it in preview pages under `app/dev/*`:
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
  streamDelayMs,
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
        usage={later(usage === undefined ? usageFor(plan) : usage, streamDelayMs)}
        openCallbacks={later(openCallbacks, streamDelayMs)}
      >
        {children}
      </AppShell>
    </ClinicProvider>
  );
}
