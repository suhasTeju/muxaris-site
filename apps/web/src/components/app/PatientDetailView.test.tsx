// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Notification, PatientDetail } from "@muxaris/shared";

vi.mock("@/lib/api-client", () => ({ useApi: () => vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { PatientDetailView } from "./PatientDetailView";

afterEach(cleanup);

const detail = {
  patient: {
    id: "pat_1",
    clinicId: "cl_1",
    phoneMasked: "+91 •••• ••3210",
    name: "Ravi",
    email: null,
    preferredLanguage: "en-IN",
    dob: null,
    notes: null,
    consentAt: null,
    createdAt: "2026-10-01T05:00:00Z",
    updatedAt: "2026-10-01T05:00:00Z",
  },
  appointments: [
    {
      id: "apt_1",
      doctorId: "d1",
      serviceId: "s1",
      startsAt: "2026-10-06T04:00:00Z",
      endsAt: "2026-10-06T04:30:00Z",
      status: "scheduled",
    },
  ],
  calls: [
    {
      id: "call_1",
      startedAt: "2026-10-05T04:00:00Z",
      endedAt: null,
      durationS: 60,
      outcome: "booked",
      summary: "Booked a cleaning",
    },
  ],
} as unknown as PatientDetail;

const note: Notification = {
  id: "ntf_1",
  clinicId: "cl_1",
  patientId: "pat_1",
  appointmentId: "apt_1",
  channel: "email",
  template: "appointment_confirmed",
  language: "en-IN",
  toMasked: "r•••@x.com",
  status: "sent",
  error: null,
  providerId: null,
  attempts: 1,
  nextAttemptAt: null,
  payload: { subject: "s", body: "b" },
  createdAt: "2026-10-05T05:00:00Z",
  sentAt: null,
};

describe("PatientDetailView", () => {
  it("shows the masked phone, the visit, the call and the message", () => {
    render(
      <PatientDetailView
        detail={detail}
        doctors={[{ id: "d1", name: "Dr. Rao" }]}
        services={[{ id: "s1", name: "Cleaning" }]}
        notifications={[note]}
        tz="Asia/Kolkata"
      />,
    );
    expect(screen.getByText("Ravi")).toBeTruthy();
    expect(screen.getByText("+91 •••• ••3210")).toBeTruthy();
    expect(screen.getByText(/Cleaning/)).toBeTruthy();
    expect(screen.getByText(/Dr\. Rao/)).toBeTruthy();
    expect(screen.getByText("Booked a cleaning")).toBeTruthy();
    expect(screen.getByText("r•••@x.com")).toBeTruthy();
    expect(screen.getByText("Confirmation")).toBeTruthy();
  });
});
