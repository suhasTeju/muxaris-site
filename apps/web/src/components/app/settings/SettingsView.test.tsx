// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@muxaris/shared";
import {
  assistantProfile,
  clinic,
  doctors,
  services,
  slotRules,
  usageFor,
} from "@/components/dev/fixtures";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ useApi: () => api }));
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { ApiError } from "@/lib/api";
import { SettingsView } from "./SettingsView";

afterEach(() => {
  cleanup();
  api.mockReset();
  refresh.mockReset();
});

function renderView(role: Role = "owner") {
  return render(
    <SettingsView
      clinic={clinic}
      role={role}
      doctors={doctors}
      services={services}
      slotRules={slotRules}
      assistant={assistantProfile}
      usage={usageFor("standard")}
      billing={{ enabled: true }}
    />,
  );
}

const section = (name: string) => screen.getByRole("region", { name });

describe("SettingsView", () => {
  it("below 1024 hides the jump list and gives the sections the full width", () => {
    renderView();
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    expect(nav.className.split(" ")).toEqual(expect.arrayContaining(["hidden", "lg:flex"]));
    expect(nav.parentElement!.className.split(" ")).toEqual(
      expect.arrayContaining(["grid-cols-1", "lg:grid-cols-[190px_minmax(0,1fr)]"]),
    );
    // The services table scrolls inside its card instead of squeezing its columns.
    const head = within(section("Services")).getByText("Duration");
    expect(head.closest(".overflow-x-auto")).toBeTruthy();
    expect(head.closest(".min-w-\\[640px\\]")).toBeTruthy();
  });

  it("shows every section with a jump list", () => {
    renderView();
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((a) => a.textContent),
    ).toEqual([
      "Clinic",
      "Plan",
      "Doctors",
      "Services",
      "Booking rules",
      "Assistant",
      "Notifications",
    ]);
    expect(within(section("Clinic")).getByText("+91 80 4123 4567")).toBeTruthy();
    expect(within(section("Clinic")).getByText("Asia/Kolkata (IST)")).toBeTruthy();
    expect(within(section("Doctors")).getAllByText(/Mon–Sat 10:00–20:00/)).toHaveLength(2);
    expect(within(section("Services")).getByText("₹1,500")).toBeTruthy();
    expect(
      within(section("Assistant"))
        .getByRole("link", { name: /Open assistant settings/ })
        .getAttribute("href"),
    ).toBe("/app/assistant");
  });

  it("front desk sees values and the owner-only note, with no edit controls", () => {
    renderView("front_desk");
    expect(screen.queryByRole("button", { name: /^Edit/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add doctor" })).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    // Clinic, Doctors, Services, Booking rules and Notifications carry the note.
    expect(screen.getAllByText("Only the clinic owner can change this.")).toHaveLength(5);
    expect(screen.getByText("Only the clinic owner can change the plan.")).toBeTruthy();
  });

  it("clinic: saves the edited details with PATCH /v1/clinic and refreshes the shell", async () => {
    api.mockResolvedValue({ clinic: { ...clinic, name: "Sunrise Dental" } });
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Edit clinic details" }));
    const clinicSection = section("Clinic");
    fireEvent.change(within(clinicSection).getByLabelText("Name"), {
      target: { value: "  Sunrise Dental " },
    });
    fireEvent.change(within(clinicSection).getByLabelText("Phone"), {
      target: { value: "080 4123 4567" },
    });
    fireEvent.click(within(clinicSection).getByRole("checkbox", { name: /Telugu/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save clinic details" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/v1/clinic", {
        method: "PATCH",
        body: {
          name: "Sunrise Dental",
          city: "Bengaluru",
          address: clinic.address,
          phone: "+918041234567",
          languages: ["en-IN", "hi-IN", "kn-IN", "ta-IN"],
        },
      }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy();
    expect(screen.getAllByText("Sunrise Dental").length).toBeGreaterThan(0);
  });

  it("clinic: an invalid phone blocks the save", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Edit clinic details" }));
    fireEvent.change(within(section("Clinic")).getByLabelText("Phone"), {
      target: { value: "12345" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save clinic details" }));
    expect(screen.getByText("Enter a valid Indian phone number")).toBeTruthy();
    expect(api).not.toHaveBeenCalled();
  });

  it("services: PATCHes changed rows, deactivates removed ones and POSTs new ones", async () => {
    api.mockImplementation(async (path: string, init: { method: string; body: object }) => {
      if (init.method === "POST") return { service: { ...services[0], id: "s_new", ...init.body } };
      const id = path.split("/").pop();
      return { service: { ...services.find((s) => s.id === id), ...init.body } };
    });
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Edit services" }));
    const table = section("Services");
    const prices = within(table).getAllByLabelText("Price (₹)");
    fireEvent.change(prices[2]!, { target: { value: "2200" } });
    fireEvent.click(within(table).getAllByRole("button", { name: "Remove service" })[3]!);
    fireEvent.click(within(table).getByRole("button", { name: "Add a service" }));
    const names = within(table).getAllByLabelText("Service");
    fireEvent.change(names[names.length - 1]!, { target: { value: "Braces review" } });
    fireEvent.click(screen.getByRole("button", { name: "Save services" }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(3));
    expect(api).toHaveBeenNthCalledWith(1, "/v1/services/s4", {
      method: "PATCH",
      body: { active: false },
    });
    expect(api).toHaveBeenNthCalledWith(2, "/v1/services/s3", {
      method: "PATCH",
      body: { priceInr: 2200 },
    });
    expect(api).toHaveBeenNthCalledWith(3, "/v1/services", {
      method: "POST",
      body: {
        name: "Braces review",
        durationMin: 30,
        bufferMin: 5,
        priceInr: 0,
        bookableByAi: true,
      },
    });
    await waitFor(() => expect(within(table).queryByText("Root canal")).toBeNull());
    expect(within(table).getByText("₹2,200")).toBeTruthy();
    expect(within(table).getByText("Braces review")).toBeTruthy();
  });

  it("services: an out-of-range duration shows an error and saves nothing", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Edit services" }));
    fireEvent.change(within(section("Services")).getAllByLabelText("Duration (min)")[0]!, {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save services" }));
    expect(screen.getByRole("alert").textContent).toBe(
      "Consultation: duration must be 5 to 480 minutes.",
    );
    expect(api).not.toHaveBeenCalled();
  });

  it("booking rules: PUTs the edited rules", async () => {
    api.mockResolvedValue({ slotRules: { ...slotRules, leadTimeMin: 120 } });
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Edit booking rules" }));
    fireEvent.change(screen.getByLabelText("Lead time (min)"), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: "Save booking rules" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/v1/slot-rules", {
        method: "PUT",
        body: {
          slotGrainMin: 15,
          leadTimeMin: 120,
          maxDaysAhead: 30,
          allowSameDay: true,
          maxPerSlot: 1,
        },
      }),
    );
    await waitFor(() => expect(within(section("Booking rules")).getByText("120 min")).toBeTruthy());
  });

  it("doctor drawer: PATCHes only changed fields and leaves untouched hours alone", async () => {
    api.mockResolvedValue({ doctor: { ...doctors[0], name: "Dr. Meera R. Rao" } });
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Edit Dr. Meera Rao" }));
    const drawer = screen.getByRole("dialog", { name: "Edit doctor" });
    fireEvent.change(within(drawer).getByLabelText("Name"), {
      target: { value: "Dr. Meera R. Rao" },
    });
    fireEvent.click(within(drawer).getByRole("button", { name: "Save doctor" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith("/v1/doctors/d1", {
      method: "PATCH",
      body: { name: "Dr. Meera R. Rao" },
    });
    expect(within(section("Doctors")).getByText(/Dr\. Meera R\. Rao/)).toBeTruthy();
  });

  it("doctor drawer: deactivating and closing Saturday PATCHes and PUTs the hours", async () => {
    api.mockImplementation(async (_path: string, init: { method: string; body: object }) =>
      init.method === "PATCH" ? { doctor: { ...doctors[1], active: false } } : { ok: true },
    );
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Edit Dr. Arjun Shetty" }));
    const drawer = screen.getByRole("dialog", { name: "Edit doctor" });
    fireEvent.click(within(drawer).getByRole("checkbox", { name: "Saturday" }));
    fireEvent.click(within(drawer).getByRole("switch", { name: "Active" }));
    fireEvent.click(within(drawer).getByRole("button", { name: "Save doctor" }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    expect(api).toHaveBeenNthCalledWith(1, "/v1/doctors/d2", {
      method: "PATCH",
      body: { active: false },
    });
    expect(api).toHaveBeenNthCalledWith(2, "/v1/doctors/d2/hours", {
      method: "PUT",
      body: {
        hours: [1, 2, 3, 4, 5].map((weekday) => ({
          weekday,
          startTime: "10:00",
          endTime: "20:00",
        })),
      },
    });
    await waitFor(() => expect(within(section("Doctors")).getByText("(inactive)")).toBeTruthy());
  });

  it("doctor drawer: adding a doctor POSTs it, then PUTs the default hours", async () => {
    api.mockImplementation(async (path: string, init: { method: string; body: object }) =>
      path === "/v1/doctors"
        ? { doctor: { ...doctors[0], id: "d3", ...init.body, workingHours: [] } }
        : { ok: true },
    );
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Add doctor" }));
    const drawer = screen.getByRole("dialog", { name: "Add doctor" });
    fireEvent.change(within(drawer).getByLabelText("Name"), { target: { value: "Dr. Kavya N" } });
    fireEvent.change(within(drawer).getByLabelText("Specialties"), {
      target: { value: "Endodontics, Pedodontics" },
    });
    fireEvent.click(within(drawer).getByRole("button", { name: "Save doctor" }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    expect(api).toHaveBeenNthCalledWith(1, "/v1/doctors", {
      method: "POST",
      body: {
        name: "Dr. Kavya N",
        specialties: ["Endodontics", "Pedodontics"],
        languages: ["en-IN", "hi-IN"],
        color: "#c2771b",
        active: true,
      },
    });
    const put = api.mock.calls[1]!;
    expect(put[0]).toBe("/v1/doctors/d3/hours");
    expect(put[1].method).toBe("PUT");
    expect(put[1].body.hours.length).toBeGreaterThan(0);
    await waitFor(() => expect(within(section("Doctors")).getByText(/Dr\. Kavya N/)).toBeTruthy());
  });

  it("doctor drawer: a failed save keeps the drawer open with the error", async () => {
    api.mockRejectedValue(new ApiError(403, "forbidden", "owner role required"));
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Edit Dr. Meera Rao" }));
    const drawer = screen.getByRole("dialog", { name: "Edit doctor" });
    fireEvent.change(within(drawer).getByLabelText("Name"), { target: { value: "Dr. M" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Save doctor" }));
    await waitFor(() =>
      expect(within(drawer).getByRole("alert").textContent).toBe(
        "Only the clinic owner can change this.",
      ),
    );
  });
});
