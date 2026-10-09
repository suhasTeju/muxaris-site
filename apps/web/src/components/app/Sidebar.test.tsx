// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  vi.restoreAllMocks();
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

// One object for every render, as the layout's streamed values keep their identity until the
// server sends new ones.
const STANDARD = usage();

function sidebar(over: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  return <Sidebar open onNavigate={() => undefined} usage={STANDARD} openCallbacks={0} {...over} />;
}

describe("Sidebar", () => {
  it("shows the layout's values and makes no requests on first render", () => {
    route({ total: 9 });
    render(sidebar({ openCallbacks: 3 }));
    expect(screen.getByLabelText("3 open")).toBeTruthy();
    expect(screen.getByText("1,842")).toBeTruthy();
    expect(api).not.toHaveBeenCalled();
  });

  it("links Callbacks and shows the open count", () => {
    render(sidebar({ openCallbacks: 3 }));
    const link = mainNav().getByRole("link", { name: /Callbacks/ });
    expect(link.getAttribute("href")).toBe("/app/callbacks");
    expect(link.getAttribute("aria-current")).toBe("page");
    expect(link.className).toContain("font-semibold");
    expect(within(link).getByLabelText("3 open")).toBeTruthy();
  });

  it("lists the navigation in order, with Assistant on its own page", () => {
    render(sidebar());
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
    render(sidebar());
    expect(mainNav().getByRole("link", { name: "Assistant" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("renders no badge when the count is zero or could not be loaded", () => {
    const { rerender } = render(sidebar({ openCallbacks: 0 }));
    expect(screen.queryByLabelText(/open$/)).toBeNull();
    rerender(sidebar({ openCallbacks: null }));
    expect(screen.queryByLabelText(/open$/)).toBeNull();
  });

  it("shows minutes used against the plan with the plan hint and the try link", () => {
    render(sidebar());
    expect(screen.getByText("1,842")).toBeTruthy();
    expect(screen.getByText("/ 3,000 min")).toBeTruthy();
    expect(screen.getByText("Standard plan")).toBeTruthy();
    expect(screen.getByRole("meter", { name: "Minutes used" }).getAttribute("aria-valuenow")).toBe(
      "61",
    );
    expect(screen.getByRole("link", { name: "Try your assistant" }).getAttribute("href")).toBe(
      "/app/assistant/try",
    );
  });

  it("turns the meter rose at 90% and shows when a pilot ends", () => {
    render(
      sidebar({
        usage: usage({
          plan: "pilot",
          planName: "Pilot",
          callSeconds: 462 * 60,
          includedCallMinutes: 500,
          pilotEndsAt: "2026-10-25T06:30:00.000Z",
        }),
      }),
    );
    const hint = screen.getByText("Pilot ends 25 Oct 2026");
    expect(hint.style.color).toBe("rgb(180, 35, 74)");
    const fill = screen.getByRole("meter").firstElementChild as HTMLElement;
    expect(fill.style.background).toBe("rgb(224, 72, 112)");
  });

  it("renders the streamed values once the layout's promises resolve", async () => {
    let resolveUsage!: (u: UsageSummary | null) => void;
    let resolveCount!: (n: number | null) => void;
    const usageP = new Promise<UsageSummary | null>((r) => (resolveUsage = r));
    const countP = new Promise<number | null>((r) => (resolveCount = r));
    // React 19: a render that suspends must happen inside an awaited act.
    await act(async () => {
      render(sidebar({ usage: usageP, openCallbacks: countP }));
    });
    // Nav renders at once; the card shows a dash while minutes are on their way.
    expect(mainNav().getAllByRole("link")).toHaveLength(9);
    expect(screen.getByText("–")).toBeTruthy();
    expect(screen.queryByText("Couldn't load usage")).toBeNull();
    await act(async () => {
      resolveUsage(usage());
      resolveCount(4);
    });
    expect(await screen.findByText("1,842")).toBeTruthy();
    expect(screen.getByLabelText("4 open")).toBeTruthy();
    expect(api).not.toHaveBeenCalled();
  });

  it("says when the layout could not load usage", async () => {
    await act(async () => {
      render(sidebar({ usage: Promise.resolve(null) }));
    });
    expect(screen.getByText("Couldn't load usage")).toBeTruthy();
  });

  it("refetches on a client navigation only once the values are a minute old", async () => {
    route({ total: 5, minutes: usage({ callSeconds: 60 * 12 }) });
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const { rerender } = render(sidebar({ openCallbacks: 3 }));
    nav.pathname = "/app/calls";
    rerender(sidebar({ openCallbacks: 3 }));
    expect(api).not.toHaveBeenCalled();

    now.mockReturnValue(1_000_000 + 61_000);
    nav.pathname = "/app/patients";
    rerender(sidebar({ openCallbacks: 3 }));
    expect(await screen.findByLabelText("5 open")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("12")).toBeTruthy());
    expect(api).toHaveBeenCalledWith("/v1/callbacks?status=open&limit=1");
    expect(api).toHaveBeenCalledWith("/v1/usage");

    // A new value from the server (router.refresh, clinic switch) replaces the refetched one.
    rerender(sidebar({ openCallbacks: 2 }));
    expect(screen.getByLabelText("2 open")).toBeTruthy();
  });

  it("refetches straight away when leaving the Try page, where test calls use minutes", async () => {
    route({ total: 3, minutes: usage({ callSeconds: 60 * 1850 }) });
    nav.pathname = "/app/assistant/try";
    const { rerender } = render(sidebar());
    nav.pathname = "/app";
    rerender(sidebar());
    expect(await screen.findByText("1,850")).toBeTruthy();
    expect(api).toHaveBeenCalledWith("/v1/usage");
  });

  it("keeps the last values when a refetch fails", async () => {
    api.mockRejectedValue(new Error("down"));
    nav.pathname = "/app/assistant/try";
    const { rerender } = render(sidebar({ openCallbacks: 3 }));
    nav.pathname = "/app";
    rerender(sidebar({ openCallbacks: 3 }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("3 open")).toBeTruthy();
    expect(screen.getByText("1,842")).toBeTruthy();
  });

  it("is hidden below 1024px until the menu opens", () => {
    const { rerender } = render(sidebar({ open: false }));
    const aside = document.getElementById("app-sidebar")!;
    expect(aside.className).toContain("hidden");
    expect(aside.className).toContain("lg:flex");
    rerender(sidebar({ open: true }));
    expect(aside.className).toContain("fixed");
    expect(aside.className).not.toMatch(/(^| )hidden( |$)/);
  });

  it("takes focus when the menu opens and keeps Tab inside the panel", () => {
    const { rerender } = render(sidebar({ open: false }));
    rerender(sidebar({ open: true }));
    const aside = document.getElementById("app-sidebar")!;
    const links = aside.querySelectorAll<HTMLElement>("a[href]");
    const first = links[0]!;
    const last = links[links.length - 1]!;
    expect(document.activeElement).toBe(first);
    expect(first.getAttribute("href")).toBe("/app");

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    expect(last.textContent).toBe("Try your assistant");
  });
});
