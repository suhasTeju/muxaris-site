// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Callback } from "@muxaris/shared";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ useApi: () => api }));

import { CallbacksQueue } from "./CallbacksQueue";

afterEach(() => {
  cleanup();
  api.mockReset();
});

const cb = (over: Partial<Callback> = {}): Callback => ({
  id: "k1",
  clinicId: "cl",
  callId: "c1",
  patientId: null,
  phoneMasked: "+91 •••• ••3210",
  reason: "Wants a call about braces",
  priority: "normal",
  status: "open",
  assignedTo: null,
  note: null,
  createdAt: "2026-10-06T04:00:00Z",
  doneAt: null,
  ...over,
});

describe("CallbacksQueue", () => {
  it("lists open callbacks with masked phones and a link to the call", () => {
    render(<CallbacksQueue initial={[cb()]} initialTotal={1} tz="Asia/Kolkata" />);
    expect(screen.getByText("+91 •••• ••3210")).toBeTruthy();
    expect(screen.getByText("Wants a call about braces")).toBeTruthy();
    expect(screen.getByRole("link", { name: "View call" }).getAttribute("href")).toBe(
      "/app/calls/c1",
    );
    expect(screen.getByRole("tab", { name: /Open/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("marks done, sends the note, and moves the row to the Done tab", async () => {
    api.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (init?.method === "PATCH")
        return { callback: cb({ status: "done", doneAt: "2026-10-06T05:00:00Z", note: "Called" }) };
      return {
        callbacks: [cb({ status: "done", doneAt: "2026-10-06T05:00:00Z", note: "Called" })],
        total: 1,
      };
    });
    render(<CallbacksQueue initial={[cb()]} initialTotal={1} tz="Asia/Kolkata" />);
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Called" } });
    fireEvent.click(screen.getByRole("button", { name: "Mark done" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/v1/callbacks/k1", {
        method: "PATCH",
        body: { status: "done", note: "Called" },
      }),
    );
    await waitFor(() => expect(screen.queryByText("Wants a call about braces")).toBeNull());
    expect(screen.getByText(/Nothing waiting/)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /Done/ }));
    const row = await screen.findByText("Wants a call about braces");
    expect(within(row.closest("li")!).getByText("Called")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mark done" })).toBeNull();
    // The Done tab asked the API for done callbacks.
    expect(api.mock.calls.some(([p]) => String(p).includes("status=done"))).toBe(true);
  });

  it("saves assignee and note without closing the callback", async () => {
    api.mockResolvedValue({ callback: cb({ assignedTo: "Priya", note: "Try after 5" }) });
    render(<CallbacksQueue initial={[cb()]} initialTotal={1} tz="Asia/Kolkata" />);
    expect(screen.queryByRole("button", { name: "Save details" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Assigned to"), { target: { value: "Priya" } });
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Try after 5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save details" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/v1/callbacks/k1", {
        method: "PATCH",
        body: { assignedTo: "Priya", note: "Try after 5" },
      }),
    );
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save details" })).toBeNull());
    expect(screen.getByText("Wants a call about braces")).toBeTruthy();
  });

  it("shows an inline error and keeps the row when Mark done fails", async () => {
    api.mockRejectedValue(new Error("offline"));
    render(<CallbacksQueue initial={[cb()]} initialTotal={1} tz="Asia/Kolkata" />);
    fireEvent.click(screen.getByRole("button", { name: "Mark done" }));
    expect((await screen.findByRole("alert")).textContent).toBe("offline");
    expect(screen.getByText("Wants a call about braces")).toBeTruthy();
  });
});
