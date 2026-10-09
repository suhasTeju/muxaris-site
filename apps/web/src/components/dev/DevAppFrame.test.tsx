// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ useApi: () => api }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dev/shell",
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("aws-amplify/auth", () => ({ signOut: vi.fn() }));

import { DevAppFrame } from "./DevAppFrame";

afterEach(() => {
  cleanup();
  api.mockReset();
});

describe("DevAppFrame", () => {
  it("renders the real shell with the fixture clinic, owner and standard plan, and no API calls", () => {
    render(
      <DevAppFrame>
        <p>Page body</p>
      </DevAppFrame>,
    );
    const header = within(screen.getByRole("banner"));
    expect(header.getByText("Sunrise Dental Care")).toBeTruthy();
    expect(header.getByText("Owner")).toBeTruthy();
    expect(header.getByText("owner@sunrisedental.in")).toBeTruthy();
    expect(screen.getByLabelText("3 open")).toBeTruthy();
    expect(screen.getByText("1,842")).toBeTruthy();
    expect(screen.getByText("/ 3,000 min")).toBeTruthy();
    expect(screen.getByText("Standard plan")).toBeTruthy();
    expect(screen.getByText("Page body")).toBeTruthy();
    expect(api).not.toHaveBeenCalled();
  });

  it("switches to front desk on the pilot plan with two clinics", () => {
    render(
      <DevAppFrame role="front_desk" plan="pilot" multiClinic openCallbacks={0}>
        <p>Page body</p>
      </DevAppFrame>,
    );
    const header = within(screen.getByRole("banner"));
    expect(header.getByText("Front desk")).toBeTruthy();
    expect(header.getByText("frontdesk@sunrisedental.in")).toBeTruthy();
    expect(header.getByRole("combobox", { name: "Switch clinic" })).toBeTruthy();
    expect(screen.getByText("462")).toBeTruthy();
    expect(screen.getByText("Pilot ends 25 Oct 2026")).toBeTruthy();
    expect(screen.queryByLabelText(/open$/)).toBeNull();
    expect(api).not.toHaveBeenCalled();
  });

  it("shows the usage error state when usage is null", () => {
    render(
      <DevAppFrame usage={null}>
        <p>Page body</p>
      </DevAppFrame>,
    );
    expect(screen.getByText("Couldn't load usage")).toBeTruthy();
    expect(api).not.toHaveBeenCalled();
  });
});
