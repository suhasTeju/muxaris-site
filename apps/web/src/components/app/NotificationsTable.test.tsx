// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Notification } from "@muxaris/shared";
import { ToastProvider } from "@/components/ui";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ useApi: () => api }));

import { NotificationsTable } from "./NotificationsTable";

afterEach(() => {
  cleanup();
  api.mockReset();
});

const base: Notification = {
  id: "ntf_1",
  clinicId: "cl_1",
  patientId: "pat_1",
  appointmentId: "apt_1",
  channel: "email",
  template: "appointment_confirmed",
  language: "en-IN",
  toMasked: "r•••@x.com",
  status: "skipped",
  error: "no_contact",
  providerId: null,
  attempts: 0,
  nextAttemptAt: null,
  payload: { subject: "Appointment confirmed at Sunrise", body: "Namaste Ravi. …" },
  createdAt: "2026-10-05T05:00:00Z",
  sentAt: null,
};

describe("NotificationsTable", () => {
  it("renders the columns: time, kind, channel, masked recipient, status and skip reason", () => {
    render(<NotificationsTable items={[base]} tz="Asia/Kolkata" onChanged={() => undefined} />);
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Time", "Type", "Channel", "To", "Status", "Details", "Actions"]);
    const cells = screen.getAllByRole("cell").map((c) => c.textContent);
    expect(cells.slice(0, 6)).toEqual([
      "5 Oct, 10:30 am",
      "Confirmation",
      "Email",
      "r•••@x.com",
      "Not sent",
      "No email on file",
    ]);
  });

  it("shows a dash where there is no recipient or detail, and links the patient on request", () => {
    render(
      <NotificationsTable
        items={[{ ...base, toMasked: "", status: "sent", error: null }]}
        tz="Asia/Kolkata"
        onChanged={() => undefined}
        showPatientLink
      />,
    );
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Patient" }).getAttribute("href")).toBe(
      "/app/patients/pat_1",
    );
  });

  it("shows the empty state", () => {
    render(<NotificationsTable items={[]} tz="Asia/Kolkata" onChanged={() => undefined} />);
    expect(
      screen.getByText("No messages yet. Confirmations appear here when an appointment is booked."),
    ).toBeTruthy();
  });

  it("retries failed and skipped rows through the API and confirms with a toast", async () => {
    const onChanged = vi.fn();
    api.mockResolvedValue({ notification: { ...base, status: "queued", error: null } });
    render(
      <ToastProvider>
        <NotificationsTable items={[base]} tz="Asia/Kolkata" onChanged={onChanged} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/v1/notifications/ntf_1/retry", { method: "POST" }),
    );
    await waitFor(() =>
      expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ status: "queued" })),
    );
    expect(screen.getByRole("status").textContent).toContain("Message queued again");
  });

  it("says so when a retry still cannot send", async () => {
    api.mockResolvedValue({ notification: { ...base, status: "skipped", error: "no_contact" } });
    render(
      <ToastProvider>
        <NotificationsTable items={[base]} tz="Asia/Kolkata" onChanged={() => undefined} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect((await screen.findByRole("status")).textContent).toContain("Not sent: No email on file");
  });

  it("shows the retry error inline", async () => {
    api.mockRejectedValue(new Error("the appointment time has passed"));
    render(<NotificationsTable items={[base]} tz="Asia/Kolkata" onChanged={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect((await screen.findByRole("alert")).textContent).toBe("the appointment time has passed");
  });

  it("shows no retry for superseded rows", () => {
    render(
      <NotificationsTable
        items={[{ ...base, status: "skipped", error: "superseded" }]}
        tz="Asia/Kolkata"
        onChanged={() => undefined}
      />,
    );
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
    expect(screen.getByText(/Replaced by a later message/)).toBeTruthy();
  });

  it("shows no retry for sent rows and expands the message body", () => {
    render(
      <NotificationsTable
        items={[{ ...base, status: "sent", error: null }]}
        tz="Asia/Kolkata"
        onChanged={() => undefined}
      />,
    );
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
    const toggle = screen.getByRole("button", { name: "View message" });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.textContent).toBe("Hide message");
    expect(screen.getByText("Subject")).toBeTruthy();
    expect(screen.getByText("Appointment confirmed at Sunrise")).toBeTruthy();
    expect(screen.getByText(/Namaste Ravi/)).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.queryByText(/Namaste Ravi/)).toBeNull();
  });
});
