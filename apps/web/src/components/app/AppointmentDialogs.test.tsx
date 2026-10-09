// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Appointment, Doctor, Service } from "@muxaris/shared";
import { ApiError } from "@/lib/api";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ useApi: () => api }));

import { NewAppointmentDialog, RescheduleDialog } from "./AppointmentDialogs";

const slot = { doctorId: "d1", startsAt: "2099-01-01T04:00:00Z", endsAt: "2099-01-01T04:30:00Z" };
const doctors = [{ id: "d1", name: "Dr. Rao" }] as unknown as Doctor[];
const services = [
  { id: "s1", name: "Cleaning", durationMin: 30, active: true },
] as unknown as Service[];

beforeEach(() => {
  api.mockReset();
});
afterEach(cleanup);

describe("NewAppointmentDialog", () => {
  it("shows the 'slot just taken' message on a 409 conflict and keeps the dialog open", async () => {
    api.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (path.startsWith("/v1/slots")) return { slots: [slot] };
      if (init?.method === "POST") throw new ApiError(409, "conflict", "slot taken");
      return {};
    });
    const onDone = vi.fn();
    render(
      <NewAppointmentDialog
        services={services}
        doctors={doctors}
        tz="Asia/Kolkata"
        defaultDate="2099-01-01"
        onClose={vi.fn()}
        onDone={onDone}
      />,
    );
    fireEvent.change(screen.getByLabelText("Service"), { target: { value: "s1" } });
    fireEvent.click(await screen.findByRole("option", { name: /9:30 am/ }));
    fireEvent.change(screen.getByLabelText("Patient phone"), {
      target: { value: "+919876543210" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Book appointment" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("That slot was just taken. Pick another time.");
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Book appointment" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});

describe("RescheduleDialog", () => {
  it("picks a slot and PATCHes the new start time, then calls onDone", async () => {
    api.mockImplementation(async (path: string) =>
      path.startsWith("/v1/slots") ? { slots: [slot] } : {},
    );
    const onDone = vi.fn();
    const appointment = {
      id: "a1",
      doctorId: "d1",
      serviceId: "s1",
      startsAt: "2098-12-31T04:00:00Z",
    } as unknown as Appointment;
    render(
      <RescheduleDialog
        appointment={appointment}
        tz="Asia/Kolkata"
        doctorName="Dr. Rao"
        onClose={vi.fn()}
        onDone={onDone}
      />,
    );
    fireEvent.click(await screen.findByRole("option", { name: /9:30 am/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm new time" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(api).toHaveBeenCalledWith("/v1/appointments/a1/reschedule", {
      method: "PATCH",
      body: { startsAt: slot.startsAt },
    });
  });
});
