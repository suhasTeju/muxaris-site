// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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
