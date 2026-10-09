// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Appointment } from "@muxaris/shared";
import { TodayAppointmentList } from "./TodayAppointmentList";

afterEach(cleanup);

const appt = (
  id: string,
  startsAt: string,
  status: Appointment["status"] = "scheduled",
  doctorId = "d1",
) =>
  ({
    id,
    patientId: "p1",
    doctorId,
    serviceId: "s1",
    startsAt,
    endsAt: startsAt,
    status,
    patient: { name: "Asha", phoneMasked: "+91 •••• ••3210" },
  }) as unknown as Appointment;

const props = {
  doctors: [
    { id: "d1", name: "Dr. Rao", color: "#0e9a96" },
    { id: "d2", name: "Dr. Shetty", color: "#7b6fd6" },
  ],
  services: [{ id: "s1", name: "Cleaning" }],
  tz: "Asia/Kolkata",
  now: new Date("2026-10-09T08:40:00Z"), // 2:10 pm IST
};

describe("TodayAppointmentList", () => {
  it("groups by doctor with a count, mono time, service and patient, linking to the appointment", () => {
    render(
      <TodayAppointmentList
        {...props}
        appointments={[
          appt("a1", "2026-10-09T04:30:00Z"),
          appt("a2", "2026-10-09T05:00:00Z", "confirmed", "d2"),
        ]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Dr. Rao" }).nextSibling?.textContent).toBe("1");
    expect(screen.getByRole("heading", { name: "Dr. Shetty" })).toBeTruthy();
    expect(screen.getAllByText("· Asha")).toHaveLength(2);
    const link = screen.getAllByRole("link")[0]!;
    expect(link.getAttribute("href")).toBe("/app/appointments?id=a1");
    expect(link.textContent).toContain("10:00 am");
    expect(screen.getByText("Confirmed")).toBeTruthy();
    // The phone number never shows in this list.
    expect(screen.queryByText(/••••/)).toBeNull();
  });

  it("puts NOW before the first appointment still to start, once per doctor", () => {
    render(
      <TodayAppointmentList
        {...props}
        appointments={[
          appt("a1", "2026-10-09T04:30:00Z", "completed"),
          appt("a2", "2026-10-09T09:00:00Z"),
          appt("a3", "2026-10-09T11:00:00Z"),
        ]}
      />,
    );
    const marker = screen.getByText("NOW · 2:10 PM");
    const rows = screen.getAllByRole("link");
    expect(
      marker.compareDocumentPosition(rows[0]!) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
    expect(
      marker.compareDocumentPosition(rows[1]!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getAllByText("NOW · 2:10 PM")).toHaveLength(1);
  });

  it("dims past and cancelled rows and strikes through cancelled ones", () => {
    render(
      <TodayAppointmentList
        {...props}
        appointments={[
          appt("a1", "2026-10-09T04:30:00Z", "completed"),
          appt("a2", "2026-10-09T12:30:00Z", "cancelled"),
          appt("a3", "2026-10-09T11:00:00Z"),
        ]}
      />,
    );
    const [past, upcoming, cancelled] = screen.getAllByRole("link");
    expect(past!.style.opacity).toBe("0.55");
    expect(upcoming!.style.opacity).toBe("1");
    expect(cancelled!.style.opacity).toBe("0.55");
    expect(cancelled!.querySelector(".line-through")).not.toBeNull();
    expect(upcoming!.querySelector(".line-through")).toBeNull();
  });

  it("names a patient without a name Unnamed", () => {
    const bare = { ...appt("a1", "2026-10-09T11:00:00Z"), patient: undefined } as Appointment;
    render(<TodayAppointmentList {...props} appointments={[bare]} />);
    expect(screen.getByText("· Unnamed")).toBeTruthy();
  });
});
