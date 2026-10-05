// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Notification } from "@muxaris/shared";

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
  it("renders kind, channel, masked recipient, status and a readable skip reason", () => {
    render(<NotificationsTable items={[base]} tz="Asia/Kolkata" onChanged={() => undefined} />);
    expect(screen.getAllByText("Confirmation").length).toBeGreaterThan(0);
    expect(screen.getAllByText("r•••@x.com").length).toBeGreaterThan(0);
    expect(screen.getAllByText("No email on file").length).toBeGreaterThan(0);
  });

  it("retries failed and skipped rows through the API", async () => {
    const onChanged = vi.fn();
    api.mockResolvedValue({ notification: { ...base, status: "queued", error: null } });
    render(<NotificationsTable items={[base]} tz="Asia/Kolkata" onChanged={onChanged} />);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/v1/notifications/ntf_1/retry", { method: "POST" }),
    );
    await waitFor(() =>
      expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ status: "queued" })),
    );
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
    fireEvent.click(screen.getByRole("button", { name: /view message/i }));
    expect(screen.getByText(/Namaste Ravi/)).toBeTruthy();
  });
});
