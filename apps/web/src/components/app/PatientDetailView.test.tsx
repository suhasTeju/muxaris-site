// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Notification, PatientDetail } from "@muxaris/shared";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ useApi: () => api }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { PatientDetailView } from "./PatientDetailView";

afterEach(() => {
  cleanup();
  api.mockReset();
});

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
    expect(screen.getByText(/Confirmation/)).toBeTruthy();
    expect(screen.getByText("· Email")).toBeTruthy();
    expect(screen.getByText("Sent")).toBeTruthy();
    expect(screen.getByText("r•••@x.com")).toBeTruthy();
    expect(screen.getByText("No email on file")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Booked a cleaning/ }).getAttribute("href")).toBe(
      "/app/calls/call_1",
    );
  });

  it("says when there are no visits, calls or messages", () => {
    render(
      <PatientDetailView
        detail={{ ...detail, appointments: [], calls: [] }}
        doctors={[]}
        services={[]}
        notifications={[]}
        tz="Asia/Kolkata"
      />,
    );
    expect(screen.getByText("No visits yet.")).toBeTruthy();
    expect(screen.getByText("No calls yet.")).toBeTruthy();
    expect(screen.getByText("No messages yet.")).toBeTruthy();
  });

  it("shows the date of birth and notes, and swaps them for the form on Edit", () => {
    render(
      <PatientDetailView
        detail={{
          ...detail,
          patient: { ...detail.patient, dob: "1994-03-12", notes: "Prefers evenings." },
        }}
        doctors={[]}
        services={[]}
        notifications={[]}
        tz="Asia/Kolkata"
      />,
    );
    expect(screen.getByText("12 Mar 1994")).toBeTruthy();
    expect(screen.getByText("Prefers evenings.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Ravi");
    expect(screen.queryByText("12 Mar 1994")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("12 Mar 1994")).toBeTruthy();
  });

  it("stacks the profile over the sections and puts each row's date on its own line on phones", () => {
    render(
      <PatientDetailView
        detail={detail}
        doctors={[{ id: "d1", name: "Dr. Rao" }]}
        services={[{ id: "s1", name: "Cleaning" }]}
        notifications={[note]}
        tz="Asia/Kolkata"
      />,
    );
    const visit = screen.getByText(/Cleaning/).closest("li")!;
    expect(visit.className).toContain("grid-cols-[150px_minmax(0,1fr)_auto]");
    expect(visit.className).toContain("max-sm:grid-cols-[minmax(0,1fr)_auto]");
    expect(visit.firstElementChild!.className).toContain("max-sm:col-span-full");
    const layout = screen.getByRole("heading", { level: 1 }).closest(".grid")!;
    expect(layout.className).toContain("lg:grid-cols-[340px_minmax(0,1fr)]");
  });
  it("shows a message on demand and hides it again", () => {
    render(
      <PatientDetailView
        detail={detail}
        doctors={[]}
        services={[]}
        notifications={[
          { ...note, payload: { subject: "Appointment confirmed", body: "See you." } },
        ]}
        tz="Asia/Kolkata"
      />,
    );
    const view = screen.getByRole("button", { name: "View message" });
    expect(view.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(view);
    const panel = document.getElementById(view.getAttribute("aria-controls")!)!;
    expect(panel.textContent).toContain("Appointment confirmed");
    expect(panel.textContent).toContain("See you.");
    fireEvent.click(screen.getByRole("button", { name: "Hide message" }));
    expect(screen.queryByText("See you.")).toBeNull();
    // A sent message cannot be retried.
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("retries a failed message and shows its new status", async () => {
    const failed = { ...note, status: "failed" as const, error: "Mailbox unavailable" };
    api.mockResolvedValue({ notification: { ...failed, status: "queued", error: null } });
    render(
      <PatientDetailView
        detail={detail}
        doctors={[]}
        services={[]}
        notifications={[failed]}
        tz="Asia/Kolkata"
      />,
    );
    const messages = screen.getByRole("heading", { name: "Messages" }).closest("section, div")!;
    expect(within(messages as HTMLElement).getByText("Failed: Mailbox unavailable")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/v1/notifications/ntf_1/retry", { method: "POST" }),
    );
    expect(await screen.findByText("Queued")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("does not offer Retry on a superseded message", () => {
    render(
      <PatientDetailView
        detail={detail}
        doctors={[]}
        services={[]}
        notifications={[{ ...note, status: "skipped", error: "superseded" }]}
        tz="Asia/Kolkata"
      />,
    );
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });
});
