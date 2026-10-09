// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import { ApiFetcherProvider } from "../core/api";
import { createFixtureApi } from "@/app/dev/core/_lib/fixture-api";
import { FIXTURE_NOW, clinic } from "@/components/dev/fixtures";

vi.mock("@/lib/api-client", () => ({ useApi: () => vi.fn() }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { AppointmentsBoard } from "./AppointmentsBoard";

afterEach(cleanup);

const NOW = new Date(FIXTURE_NOW);

function renderBoard(props: Partial<React.ComponentProps<typeof AppointmentsBoard>> = {}) {
  const api = vi.fn(createFixtureApi({ conflictOnce: true }));
  render(
    <ToastProvider>
      <ApiFetcherProvider fetcher={api as never}>
        <AppointmentsBoard tz={clinic.timezone} now={NOW} {...props} />
      </ApiFetcherProvider>
    </ToastProvider>,
  );
  return api;
}

describe("AppointmentsBoard", () => {
  it("lays today out by doctor with counts, the NOW line and struck-through cancellations", async () => {
    renderBoard();
    expect(screen.getByText("Fri, 9 Oct 2026")).toBeTruthy();
    const meera = await screen.findByRole("list", { name: "Dr. Meera Rao" });
    expect(screen.getByText("6 appointments")).toBeTruthy();
    expect(within(meera).getByText("Consultation · Ananya Krishnan")).toBeTruthy();
    expect(within(meera).getByText("Consultation · Unnamed").className).toContain("line-through");
    expect(screen.getByText("10 am")).toBeTruthy();
    expect(screen.getByText("8 pm")).toBeTruthy();
  });

  it("switches to a Monday-first week and steps a week at a time", async () => {
    renderBoard();
    await screen.findByRole("list", { name: "Dr. Meera Rao" });
    fireEvent.click(screen.getByRole("tab", { name: "Week" }));
    expect(await screen.findByText("5 Oct – 11 Oct 2026")).toBeTruthy();
    expect(await screen.findByRole("region", { name: "Mon, 5 Oct" })).toBeTruthy();
    expect(
      within(screen.getByRole("region", { name: "Fri, 9 Oct" })).getByText("Today"),
    ).toBeTruthy();
    expect(screen.getAllByText("Nothing booked.").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("12 Oct – 18 Oct 2026")).toBeTruthy();
  });

  it("opens the drawer for an upcoming visit with Reschedule and Cancel", async () => {
    renderBoard();
    fireEvent.click(await screen.findByRole("button", { name: /Consultation · Ananya Krishnan/ }));
    const drawer = await screen.findByRole("dialog");
    expect(within(drawer).getByText("Fri, 9 Oct 2026 · 4:30 pm – 4:50 pm")).toBeTruthy();
    expect(within(drawer).getByText("Booked by assistant")).toBeTruthy();
    expect(within(drawer).getByRole("link", { name: "Open the call" }).getAttribute("href")).toBe(
      "/app/calls/c1",
    );
    expect(within(drawer).getByRole("button", { name: "Reschedule" })).toBeTruthy();
    expect(within(drawer).queryByRole("button", { name: "Completed" })).toBeNull();
    fireEvent.click(within(drawer).getByRole("button", { name: "Cancel" }));
    const confirm = await screen.findByRole("dialog", { name: "Cancel appointment?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Cancel appointment" }));
    expect(await screen.findByText("Appointment cancelled. The slot is free again.")).toBeTruthy();
  });

  it("marks an ended visit completed from the drawer", async () => {
    const api = renderBoard({ initialId: "a3" });
    const drawer = await screen.findByRole("dialog");
    await act(async () => {
      fireEvent.click(within(drawer).getByRole("button", { name: "Completed" }));
    });
    expect(api).toHaveBeenCalledWith("/v1/appointments/a3/status", {
      method: "POST",
      body: { status: "completed" },
    });
    expect(await screen.findByText("Marked as completed")).toBeTruthy();
    expect(within(drawer).getByText("No actions for this appointment.")).toBeTruthy();
  });

  it("books through the dialog, recovering from a slot that was just taken", async () => {
    renderBoard();
    await screen.findByRole("list", { name: "Dr. Meera Rao" });
    fireEvent.click(screen.getByRole("button", { name: "New appointment" }));
    const dialog = await screen.findByRole("dialog", { name: "New appointment" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Book appointment" }));
    expect(within(dialog).getByRole("alert").textContent).toBe("Pick a time.");
    fireEvent.change(within(dialog).getByLabelText("Service"), { target: { value: "s1" } });
    const slots = await within(dialog).findByRole("listbox", { name: "Free slots" });
    fireEvent.click(within(slots).getAllByRole("option")[0]!);
    expect(within(slots).getAllByRole("option")[0]!.getAttribute("aria-selected")).toBe("true");
    fireEvent.change(within(dialog).getByLabelText("Patient phone"), {
      target: { value: "12345" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Book appointment" }));
    expect(within(dialog).getByRole("alert").textContent).toBe(
      "Enter a 10-digit Indian mobile number, for example 98765 43210.",
    );
    fireEvent.change(within(dialog).getByLabelText("Patient phone"), {
      target: { value: "98765 43210" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Book appointment" }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe(
      "That slot was just taken. Pick another time.",
    );
    const fresh = await within(dialog).findByRole("listbox", { name: "Free slots" });
    fireEvent.click(within(fresh).getAllByRole("option")[1]!);
    fireEvent.click(within(dialog).getByRole("button", { name: "Book appointment" }));
    expect(await screen.findByText(/^Booked Consultation for Fri, 9 Oct, /)).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
