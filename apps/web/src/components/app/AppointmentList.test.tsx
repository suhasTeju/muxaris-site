// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Appointment } from "@muxaris/shared";
import { AppointmentList } from "./AppointmentList";

afterEach(cleanup);

const appt = {
  id: "a1",
  patientId: "p1",
  doctorId: "d1",
  serviceId: "s1",
  startsAt: "2026-10-06T04:00:00Z",
  status: "scheduled",
  patient: { name: "Asha", phoneMasked: "+91 •••• ••3210" },
} as unknown as Appointment;

describe("AppointmentList patient", () => {
  it("renders the name and masked phone from the appointment DTO, no patients prop", () => {
    render(
      <AppointmentList
        appointments={[appt]}
        doctors={[{ id: "d1", name: "Dr. Rao", color: "#0f766e" }]}
        services={[{ id: "s1", name: "Cleaning" }]}
        tz="Asia/Kolkata"
      />,
    );
    expect(screen.getByText(/Asha/)).toBeTruthy();
    expect(screen.getByText("+91 •••• ••3210")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("omits the patient line when the DTO has no patient", () => {
    const bare = { ...appt, patient: undefined };
    render(
      <AppointmentList
        appointments={[bare as unknown as Appointment]}
        doctors={[{ id: "d1", name: "Dr. Rao", color: "#0f766e" }]}
        services={[{ id: "s1", name: "Cleaning" }]}
        tz="Asia/Kolkata"
      />,
    );
    expect(screen.getByText("Cleaning")).toBeTruthy();
    expect(screen.queryByText(/••••/)).toBeNull();
  });
});

describe("AppointmentList outcome", () => {
  const props = {
    doctors: [{ id: "d1", name: "Dr. Rao", color: "#0f766e" }],
    services: [{ id: "s1", name: "Cleaning" }],
    tz: "Asia/Kolkata",
  };
  const past = { ...appt, endsAt: "2026-10-06T04:30:00Z" } as unknown as Appointment;

  it("offers Completed and No-show once the visit has ended", () => {
    const onOutcome = vi.fn();
    render(
      <AppointmentList
        {...props}
        appointments={[past]}
        onOutcome={onOutcome}
        now={new Date("2026-10-06T06:00:00Z")}
      />,
    );
    expect(screen.getByRole("button", { name: "Completed" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "No-show" }));
    expect(onOutcome).toHaveBeenCalledWith(past, "no_show");
  });

  it("offers neither for a future appointment", () => {
    render(
      <AppointmentList
        {...props}
        appointments={[past]}
        onOutcome={vi.fn()}
        now={new Date("2026-10-06T03:00:00Z")}
      />,
    );
    expect(screen.queryByRole("button", { name: "Completed" })).toBeNull();
    expect(screen.queryByRole("button", { name: "No-show" })).toBeNull();
  });
});
