// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UsageSummary } from "@muxaris/shared";

const api = vi.hoisted(() => vi.fn());
const nav = vi.hoisted(() => ({ pathname: "/app/callbacks" }));
vi.mock("@/lib/api-client", () => ({ useApi: () => api }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

import { Sidebar } from "./Sidebar";

afterEach(() => {
  cleanup();
  api.mockReset();
  nav.pathname = "/app/callbacks";
});

function usage(over: Partial<UsageSummary> = {}): UsageSummary {
  return {
    month: "2026-10",
    callSeconds: 1842 * 60,
    calls: 120,
    llmInputTokens: 0,
    llmOutputTokens: 0,
    includedCallMinutes: 3000,
    overageSeconds: 0,
    plan: "standard",
    planName: "Standard",
    priceInrMonthly: 4999,
    maxConcurrentCalls: 5,
    pilotEndsAt: null,
    ...over,
  };
}

/** Answers each endpoint the sidebar calls. */
function route({ total = 0, minutes = usage() }: { total?: number; minutes?: unknown } = {}) {
  api.mockImplementation(async (path: string) => {
    if (path.startsWith("/v1/callbacks")) return { callbacks: [], total };
    if (path === "/v1/usage") return minutes;
    throw new Error(`unexpected ${path}`);
  });
}

const mainNav = () => within(screen.getByRole("navigation", { name: "Main" }));

describe("Sidebar", () => {
  it("links Callbacks and shows the open count", async () => {
    route({ total: 3 });
    render(<Sidebar open onNavigate={() => undefined} initialUsage={usage()} />);
    const link = mainNav().getByRole("link", { name: /Callbacks/ });
    expect(link.getAttribute("href")).toBe("/app/callbacks");
    expect(link.getAttribute("aria-current")).toBe("page");
    expect(link.className).toContain("font-semibold");
    expect(await screen.findByLabelText("3 open")).toBeTruthy();
    expect(api).toHaveBeenCalledWith("/v1/callbacks?status=open&limit=1");
  });

  it("lists the navigation in order, with Assistant on its own page", () => {
    route();
    render(<Sidebar open onNavigate={() => undefined} initialUsage={usage()} />);
    const links = mainNav().getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([
      "Overview",
      "Appointments",
      "Patients",
      "Calls",
      "Analytics",
      "Callbacks",
      "Notifications",
      "Assistant",
      "Settings",
    ]);
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/app",
      "/app/appointments",
      "/app/patients",
      "/app/calls",
      "/app/analytics",
      "/app/callbacks",
      "/app/notifications",
      "/app/assistant",
      "/app/settings",
    ]);
  });

  it("marks Assistant current on the try page", () => {
    nav.pathname = "/app/assistant/try";
    route();
    render(<Sidebar open onNavigate={() => undefined} initialUsage={usage()} />);
    expect(mainNav().getByRole("link", { name: "Assistant" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("renders no badge when the count is zero or the request fails", async () => {
    api.mockRejectedValue(new Error("down"));
    render(<Sidebar open onNavigate={() => undefined} initialUsage={usage()} />);
    await screen.findByRole("link", { name: "Callbacks" });
    expect(screen.queryByLabelText(/open$/)).toBeNull();
  });

  it("shows minutes used against the plan with the plan hint and the try link", () => {
    route();
    render(<Sidebar open onNavigate={() => undefined} initialUsage={usage()} />);
    expect(screen.getByText("1,842")).toBeTruthy();
    expect(screen.getByText("/ 3,000 min")).toBeTruthy();
    expect(screen.getByText("Standard plan")).toBeTruthy();
    expect(screen.getByRole("meter", { name: "Minutes used" }).getAttribute("aria-valuenow")).toBe(
      "61",
    );
    expect(screen.getByRole("link", { name: "Try your assistant" }).getAttribute("href")).toBe(
      "/app/assistant/try",
    );
    // The layout's value is used as-is on first render: no duplicate usage request.
    expect(api).not.toHaveBeenCalledWith("/v1/usage");
  });

  it("turns the meter rose at 90% and shows when a pilot ends", () => {
    route();
    render(
      <Sidebar
        open
        onNavigate={() => undefined}
        initialUsage={usage({
          plan: "pilot",
          planName: "Pilot",
          callSeconds: 462 * 60,
          includedCallMinutes: 500,
          pilotEndsAt: "2026-10-25T06:30:00.000Z",
        })}
      />,
    );
    const hint = screen.getByText("Pilot ends 25 Oct 2026");
    expect(hint.style.color).toBe("rgb(180, 35, 74)");
    const fill = screen.getByRole("meter").firstElementChild as HTMLElement;
    expect(fill.style.background).toBe("rgb(224, 72, 112)");
  });

  it("fetches usage when the layout could not", async () => {
    route({ minutes: usage({ callSeconds: 60 * 12 }) });
    render(<Sidebar open onNavigate={() => undefined} initialUsage={null} />);
    expect(screen.getByText("Couldn't load usage")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("12")).toBeTruthy());
    expect(api).toHaveBeenCalledWith("/v1/usage");
  });

  it("is hidden below 1024px until the menu opens", () => {
    route();
    const { rerender } = render(
      <Sidebar open={false} onNavigate={() => undefined} initialUsage={usage()} />,
    );
    const aside = document.getElementById("app-sidebar")!;
    expect(aside.className).toContain("hidden");
    expect(aside.className).toContain("lg:flex");
    rerender(<Sidebar open onNavigate={() => undefined} initialUsage={usage()} />);
    expect(aside.className).toContain("fixed");
    expect(aside.className).not.toMatch(/(^| )hidden( |$)/);
  });
});
