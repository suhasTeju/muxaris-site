// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Notification } from "@muxaris/shared";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ useApi: () => api }));

import { NotificationsView } from "./NotificationsView";

afterEach(() => {
  cleanup();
  api.mockReset();
});

const mk = (id: string, status: Notification["status"]): Notification => ({
  id,
  clinicId: "cl_1",
  patientId: "pat_1",
  appointmentId: null,
  channel: "email",
  template: "appointment_confirmed",
  language: "en-IN",
  toMasked: `${id}•••@x.com`,
  status,
  error: status === "failed" ? "boom" : null,
  providerId: null,
  attempts: 0,
  nextAttemptAt: null,
  payload: { subject: "s", body: "b" },
  createdAt: "2026-10-05T05:00:00Z",
  sentAt: null,
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("NotificationsView", () => {
  it("loads each tab once, even when switching before the first load resolves", async () => {
    const failed = deferred<unknown>();
    api.mockImplementation((path: string) => {
      if (path.includes("status=failed")) return failed.promise;
      return Promise.resolve({ notifications: [mk("sent1", "sent")], total: 1 });
    });
    render(<NotificationsView initial={[mk("a", "queued")]} initialTotal={1} tz="Asia/Kolkata" />);
    fireEvent.click(screen.getByRole("tab", { name: /Failed/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Sent/ }));
    expect(await screen.findByText("sent1•••@x.com")).toBeTruthy();
    await act(async () => {
      failed.resolve({ notifications: [mk("f1", "failed")], total: 1 });
    });
    fireEvent.click(screen.getByRole("tab", { name: /Failed/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Sent/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Failed/ }));
    expect(screen.getByText("f1•••@x.com")).toBeTruthy();
    expect(api.mock.calls.filter((c) => String(c[0]).includes("status=failed"))).toHaveLength(1);
    expect(api.mock.calls.filter((c) => String(c[0]).includes("status=sent"))).toHaveLength(1);
  });

  it("a retry moves the row between buckets without corrupting another tab", async () => {
    api.mockImplementation((path: string, opts?: { method?: string }) => {
      if (opts?.method === "POST") return Promise.resolve({ notification: mk("f1", "queued") });
      if (path.includes("status=failed"))
        return Promise.resolve({ notifications: [mk("f1", "failed")], total: 1 });
      if (path.includes("status=sent"))
        return Promise.resolve({ notifications: [mk("s1", "sent")], total: 1 });
      return Promise.resolve({ notifications: [], total: 0 });
    });
    render(
      <NotificationsView
        initial={[mk("f1", "failed"), mk("s1", "sent")]}
        initialTotal={2}
        tz="Asia/Kolkata"
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /Sent/ }));
    await screen.findAllByText("s1•••@x.com");
    fireEvent.click(screen.getByRole("tab", { name: /Failed/ }));
    await screen.findAllByText("f1•••@x.com");
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(screen.queryByText("f1•••@x.com")).toBeNull());
    fireEvent.click(screen.getByRole("tab", { name: /Sent/ }));
    expect(screen.getByText("s1•••@x.com")).toBeTruthy();
    expect(screen.queryByText("f1•••@x.com")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /All/ }));
    expect(screen.getByText("f1•••@x.com")).toBeTruthy();
    expect(screen.getAllByText("Queued").length).toBeGreaterThan(1);
  });
});
