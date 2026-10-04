// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
} as unknown as Appointment;

describe("AppointmentList phone reveal", () => {
  it("click is the only toggle: hover and focus do not reveal, tap shows then hides", () => {
    render(
      <AppointmentList
        appointments={[appt]}
        doctors={[{ id: "d1", name: "Dr. Rao", color: "#0f766e" }]}
        services={[{ id: "s1", name: "Cleaning" }]}
        patients={[{ id: "p1", phone: "+919876543210", name: "Asha" }]}
        tz="Asia/Kolkata"
      />,
    );
    const btn = screen.getByRole("button", { name: /Phone ending/ });
    expect(btn.textContent).toBe("•••• 3210");
    fireEvent.mouseEnter(btn);
    fireEvent.focus(btn);
    expect(btn.textContent).toBe("•••• 3210");
    fireEvent.click(btn);
    expect(btn.textContent).toBe("+919876543210");
    fireEvent.click(btn);
    expect(btn.textContent).toBe("•••• 3210");
  });
});
