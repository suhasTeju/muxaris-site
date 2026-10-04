// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  clinicId: "clinic_1",
  profileReady: true,
  api: vi.fn(),
}));

vi.mock("./clinic-context", () => ({
  useClinic: () => ({ activeClinic: { id: state.clinicId, name: "X", role: "owner" } }),
}));
vi.mock("./use-clinic-profile", () => ({
  useClinicProfile: () => ({
    tz: "Asia/Kolkata",
    clinic: state.profileReady ? { languages: ["en-IN"], timezone: "Asia/Kolkata" } : null,
  }),
}));
vi.mock("@/lib/api-client", () => ({ useApi: () => state.api }));

import { AppointmentsView } from "./AppointmentsView";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
}
function defer<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const appt = (id: string, serviceId: string) => ({
  id,
  patientId: "p1",
  doctorId: "d1",
  serviceId,
  startsAt: "2026-10-06T04:00:00Z",
  endsAt: "2026-10-06T04:30:00Z",
  status: "scheduled",
});
const catalog = (path: string) => {
  if (path === "/v1/doctors") return { doctors: [{ id: "d1", name: "Dr. Rao", color: null }] };
  if (path === "/v1/services")
    return {
      services: [
        { id: "sA", name: "Cleaning A" },
        { id: "sB", name: "Cleaning B" },
      ],
    };
  if (path.startsWith("/v1/patients"))
    return { patients: [{ id: "p1", phone: "+919876543210", name: "Asha" }] };
  return null;
};

beforeEach(() => {
  state.clinicId = "clinic_1";
  state.profileReady = true;
  state.api = vi.fn();
});
afterEach(cleanup);

describe("AppointmentsView", () => {
  it("ignores a slow earlier response that resolves after a newer one", async () => {
    const calls: Deferred<unknown>[] = [];
    state.api.mockImplementation((path: string) => {
      if (path.startsWith("/v1/appointments?")) {
        const d = defer<unknown>();
        calls.push(d);
        return d.promise;
      }
      return Promise.resolve(catalog(path));
    });
    render(<AppointmentsView />);
    await waitFor(() => expect(calls).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    await act(async () => calls[1]!.resolve({ appointments: [appt("a2", "sB")] }));
    await screen.findByText(/Cleaning B/);
    await act(async () => calls[0]!.resolve({ appointments: [appt("a1", "sA")] }));
    expect(screen.queryByText(/Cleaning A/)).toBeNull();
    expect(screen.getByText(/Cleaning B/)).toBeTruthy();
  });

  it("does not fetch until the clinic profile has loaded", async () => {
    state.profileReady = false;
    state.api.mockImplementation((path: string) =>
      Promise.resolve(path.startsWith("/v1/appointments?") ? { appointments: [] } : catalog(path)),
    );
    const { rerender } = render(<AppointmentsView />);
    await act(async () => undefined);
    expect(state.api).not.toHaveBeenCalled();
    state.profileReady = true;
    rerender(<AppointmentsView />);
    await waitFor(() => expect(state.api).toHaveBeenCalled());
  });

  it("drops the previous clinic's data while the new clinic loads", async () => {
    state.api.mockImplementation((path: string) =>
      Promise.resolve(
        path.startsWith("/v1/appointments?") ? { appointments: [appt("a1", "sA")] } : catalog(path),
      ),
    );
    const { rerender } = render(<AppointmentsView />);
    await screen.findByText(/Cleaning A/);
    expect(screen.getByRole("button", { name: /Phone ending/ })).toBeTruthy();

    const pending = defer<unknown>();
    state.api.mockImplementation((path: string) =>
      path.startsWith("/v1/appointments?") ? pending.promise : Promise.resolve(catalog(path)),
    );
    state.clinicId = "clinic_2";
    rerender(<AppointmentsView />);
    expect(screen.getByText("Loading appointments…")).toBeTruthy();
    expect(screen.queryByText(/Cleaning A/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Phone ending/ })).toBeNull();
  });
});
