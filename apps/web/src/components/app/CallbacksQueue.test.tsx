// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Callback } from "@muxaris/shared";
import { ToastProvider } from "@/components/ui";

const api = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ useApi: () => api }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { CallbacksQueue } from "./CallbacksQueue";

afterEach(() => {
  cleanup();
  api.mockReset();
  refresh.mockReset();
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

type Props = Parameters<typeof CallbacksQueue>[0];
function renderQueue(props: Partial<Props> = {}) {
  return render(
    <ToastProvider>
      <CallbacksQueue
        initial={[cb()]}
        initialTotal={1}
        tz="Asia/Kolkata"
        today="2026-10-06"
        {...props}
      />
    </ToastProvider>,
  );
}

describe("CallbacksQueue", () => {
  it("lists open callbacks with masked phones, priority and a link to the call", () => {
    renderQueue();
    expect(screen.getByRole("heading", { name: "Callbacks" })).toBeTruthy();
    expect(screen.getByText("+91 •••• ••3210")).toBeTruthy();
    expect(screen.getByText("Wants a call about braces")).toBeTruthy();
    expect(screen.getByText("Normal")).toBeTruthy();
    expect(screen.getByText("Today, 9:30 am")).toBeTruthy();
    expect(screen.getByRole("link", { name: "View call" }).getAttribute("href")).toBe(
      "/app/calls/c1",
    );
    expect(screen.getByRole("tab", { name: "Open (1)" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getByPlaceholderText("Name")).toBeTruthy();
    expect(screen.getByPlaceholderText("What was agreed")).toBeTruthy();
  });

  it("orders open callbacks urgent, high, normal and newest first within a priority", () => {
    renderQueue({
      initial: [
        cb({ id: "a", reason: "normal old", createdAt: "2026-10-06T03:00:00Z" }),
        cb({ id: "b", reason: "high", priority: "high" }),
        cb({ id: "c", reason: "normal new", createdAt: "2026-10-06T05:00:00Z" }),
        cb({ id: "d", reason: "urgent", priority: "urgent" }),
      ],
      initialTotal: 4,
    });
    const reasons = screen.getAllByRole("article").map((a) => a.querySelector("p")?.textContent);
    expect(reasons).toEqual(["urgent", "high", "normal new", "normal old"]);
  });

  it("shows both counts when the server sent the done page, and lists done details", () => {
    renderQueue({
      initialDone: {
        items: [
          cb({
            id: "k9",
            status: "done",
            reason: "Bill copy",
            assignedTo: "Kavya",
            note: "Emailed it",
            doneAt: "2026-10-05T11:50:00Z",
          }),
        ],
        total: 1,
      },
    });
    fireEvent.click(screen.getByRole("tab", { name: "Done (1)" }));
    const card = screen.getByText("Bill copy").closest("article")!;
    expect(within(card).getByText("Done Mon, 5 Oct, 5:20 pm")).toBeTruthy();
    expect(within(card).getByText("Assigned to Kavya")).toBeTruthy();
    expect(within(card).getByText("Emailed it")).toBeTruthy();
    expect(within(card).queryByText("Normal")).toBeNull();
    expect(api).not.toHaveBeenCalled();
  });

  it("marks done, sends the note, toasts and moves the row to the Done tab", async () => {
    api.mockImplementation(async (_path: string, init?: { method?: string }) => {
      if (init?.method === "PATCH")
        return { callback: cb({ status: "done", doneAt: "2026-10-06T05:00:00Z", note: "Called" }) };
      return {
        callbacks: [cb({ status: "done", doneAt: "2026-10-06T05:00:00Z", note: "Called" })],
        total: 1,
      };
    });
    renderQueue();
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Called" } });
    fireEvent.click(screen.getByRole("button", { name: "Mark done" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/v1/callbacks/k1", {
        method: "PATCH",
        body: { status: "done", note: "Called" },
      }),
    );
    await waitFor(() => expect(screen.queryByText("Wants a call about braces")).toBeNull());
    expect(screen.getByRole("status").textContent).toContain("Callback marked done");
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByText(/Nothing waiting/)).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Open (0)" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /Done/ }));
    const row = await screen.findByText("Wants a call about braces");
    expect(within(row.closest("article")!).getByText("Called")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mark done" })).toBeNull();
    // Without a server-rendered done page, the Done tab asked the API for it.
    expect(api.mock.calls.some(([p]) => String(p).includes("status=done"))).toBe(true);
  });

  it("saves assignee and note without closing the callback", async () => {
    api.mockResolvedValue({ callback: cb({ assignedTo: "Priya", note: "Try after 5" }) });
    renderQueue();
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
    expect(screen.getByRole("status").textContent).toContain("Details saved");
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByText("Wants a call about braces")).toBeTruthy();
  });

  it("reveals the number through the audited endpoint and says it is logged", async () => {
    api.mockResolvedValue({ phone: "+919845123210" });
    renderQueue();
    fireEvent.click(screen.getByRole("button", { name: "Show number" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/v1/callbacks/k1/reveal-phone", { method: "POST" }),
    );
    const link = await screen.findByRole("link", { name: "+91 98451 23210" });
    expect(link.getAttribute("href")).toBe("tel:+919845123210");
    expect(screen.getByText("Visible for 60 seconds. This view is logged.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Show number" })).toBeNull();
    // The button went away, so focus moves to the number instead of falling to the page.
    await waitFor(() => expect(document.activeElement).toBe(link));
  });

  it("sorts each page as it arrives and keeps earlier pages in place on Load more", async () => {
    api.mockResolvedValue({
      callbacks: [
        cb({ id: "p2a", reason: "page two normal" }),
        cb({ id: "p2b", reason: "page two urgent", priority: "urgent" }),
      ],
      total: 4,
    });
    renderQueue({
      initial: [
        cb({ id: "p1a", reason: "page one normal" }),
        cb({ id: "p1b", reason: "page one high", priority: "high" }),
      ],
      initialTotal: 4,
    });
    const reasons = () =>
      screen.getAllByRole("article").map((a) => a.querySelector("p")?.textContent);
    expect(reasons()).toEqual(["page one high", "page one normal"]);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(reasons()).toHaveLength(4));
    expect(reasons()).toEqual([
      "page one high",
      "page one normal",
      "page two urgent",
      "page two normal",
    ]);
  });

  it("shows an inline error and keeps the row when Mark done fails", async () => {
    api.mockRejectedValue(new Error("offline"));
    renderQueue();
    fireEvent.click(screen.getByRole("button", { name: "Mark done" }));
    expect((await screen.findByRole("alert")).textContent).toBe("offline");
    expect(screen.getByText("Wants a call about braces")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("stacks the details form on narrow screens and keeps the desktop row from 768px", () => {
    renderQueue();
    const form = screen.getByLabelText("Note").closest(".grid")!;
    expect(form.className).toContain("grid-cols-1");
    expect(form.className).toContain("md:grid-cols-[200px_minmax(0,1fr)_auto]");
    const header = screen.getByRole("heading", { name: "Callbacks" }).parentElement!.parentElement!;
    expect(header.className).toContain("max-sm:[&_h1]:text-[22px]");
  });

  it("shows the empty states", () => {
    renderQueue({ initial: [], initialTotal: 0, initialDone: { items: [], total: 0 } });
    expect(
      screen.getByText("Nothing waiting. When a caller asks for a callback it appears here."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Done (0)" }));
    expect(screen.getByText("No completed callbacks yet.")).toBeTruthy();
  });
});
