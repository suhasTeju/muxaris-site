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

  it("renders the header, every tab's count and the optional Email designs link", () => {
    const { rerender } = render(
      <NotificationsView
        initial={[mk("a", "queued"), mk("b", "failed")]}
        initialTotal={2}
        counts={{ queued: 1, sent: 0, failed: 1, skipped: 0 }}
        tz="Asia/Kolkata"
      />,
    );
    expect(screen.getByRole("heading", { name: "Notifications" })).toBeTruthy();
    expect(screen.getByText(/SMS and WhatsApp are coming soon\./)).toBeTruthy();
    const names = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(names).toEqual(["All2", "Queued1", "Sent0", "Failed1", "Not sent0"]);
    expect(screen.queryByRole("link", { name: "Email designs" })).toBeNull();
    rerender(
      <NotificationsView initial={[]} initialTotal={0} tz="Asia/Kolkata" designsHref="/designs" />,
    );
    expect(screen.getByRole("link", { name: "Email designs" }).getAttribute("href")).toBe(
      "/designs",
    );
  });

  it("scrolls the tabs and the table inside their own boxes on narrow screens", () => {
    render(<NotificationsView initial={[mk("a", "sent")]} initialTotal={1} tz="Asia/Kolkata" />);
    const tablist = screen.getByRole("tablist", { name: "Status" });
    expect(tablist.className).toContain("max-lg:w-max");
    expect(tablist.parentElement!.className).toContain("max-lg:overflow-x-auto");
    const table = screen.getByRole("table", { name: "Messages" });
    expect(table.className).toContain("min-w-[1100px]");
    expect(table.parentElement!.className).toContain("overflow-x-auto");
  });

  it("moves the counts of unopened tabs when a retry changes a row's status", async () => {
    api.mockResolvedValue({ notification: mk("f1", "queued") });
    render(
      <NotificationsView
        initial={[mk("f1", "failed")]}
        initialTotal={1}
        counts={{ queued: 0, sent: 0, failed: 1, skipped: 0 }}
        tz="Asia/Kolkata"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /Queued/ }).textContent).toBe("Queued1"),
    );
    expect(screen.getByRole("tab", { name: /Failed/ }).textContent).toBe("Failed0");
    expect(screen.getByRole("tab", { name: /All/ }).textContent).toBe("All1");
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
