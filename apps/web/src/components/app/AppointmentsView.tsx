"use client";

import { AppointmentsBoard, type CalendarMode } from "./appointments/AppointmentsBoard";
import { useClinic } from "./clinic-context";
import { useClinicProfile } from "./use-clinic-profile";

export interface AppointmentsViewProps {
  /** YYYY-MM-DD to open on instead of today. */
  initialDate?: string;
  initialMode?: CalendarMode;
  /** Appointment whose panel opens once loaded (the Overview links here with ?id=). */
  initialId?: string;
}

/** Keyed by clinic so nothing from the previous clinic survives a switch. */
export function AppointmentsView(props: AppointmentsViewProps) {
  const { activeClinic } = useClinic();
  return <AppointmentsInner key={activeClinic.id} {...props} />;
}

function AppointmentsInner(props: AppointmentsViewProps) {
  const { clinic, tz, failed, failure, retry } = useClinicProfile();
  const ready = clinic !== null;
  return (
    <AppointmentsBoard
      {...props}
      tz={tz}
      ready={ready}
      profileError={failed ? (failure ?? "Could not load the clinic profile.") : null}
      onRetryProfile={retry}
    />
  );
}
