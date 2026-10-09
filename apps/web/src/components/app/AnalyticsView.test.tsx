// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { CallAnalytics, MonthlyUsage } from "@muxaris/shared";
import { AnalyticsView } from "./AnalyticsView";

afterEach(cleanup);

const byHour = Array.from({ length: 24 }, (_, h) => (h === 11 ? 5 : h === 10 ? 2 : 0));
const analytics: CallAnalytics = {
  from: "2026-10-01",
  to: "2026-10-07",
  totalCalls: 1210,
  bookedCalls: 605,
  bookingConversion: 0.5,
  avgDurationS: 125,
  byOutcome: { booked: 5, info: 5, weird: 1 },
  byLanguage: { "kn-IN": 6, "en-IN": 4, unknown: 1 },
  byHour,
  byDay: Array.from({ length: 7 }, (_, i) => ({
    date: `2026-10-0${i + 1}`,
    calls: i,
    booked: i % 2,
  })),
};
const months: MonthlyUsage[] = [
  { month: "2026-09", callSeconds: 600, calls: 4, llmInputTokens: 0, llmOutputTokens: 0 },
  { month: "2026-10", callSeconds: 61, calls: 1, llmInputTokens: 0, llmOutputTokens: 0 },
];

function renderView(props: Partial<Parameters<typeof AnalyticsView>[0]> = {}) {
  return render(
    <AnalyticsView
      analytics={{ ok: true, data: analytics }}
      months={{ ok: true, data: months }}
      days={30}
      includedMinutes={3000}
      tz="Asia/Kolkata"
      {...props}
    />,
  );
}

const kpi = (label: string) =>
  within(screen.getByRole("region", { name: "Key numbers" })).getByText(label).parentElement
    ?.textContent;

describe("AnalyticsView", () => {
  it("renders the range, the KPI strip and the five charts", () => {
    renderView();
    expect(screen.getByText("Thu, 1 Oct 2026 – Wed, 7 Oct 2026")).toBeTruthy();
    expect(kpi("Calls")).toBe("Calls1,210");
    expect(kpi("Booked")).toBe("Booked605");
    expect(kpi("Booking rate")).toBe("Booking rate50%");
    expect(kpi("Average call")).toBe("Average call2m 05s");
    for (const t of [
      "Calls by hour",
      "Calls by language",
      "Calls by outcome",
      "Minutes per month",
    ]) {
      expect(screen.getByRole("img", { name: t })).toBeTruthy();
      expect(screen.getByRole("table", { name: t })).toBeTruthy();
    }
    expect(
      screen.getByRole("img", { name: "Calls per day, 1210 calls and 605 booked" }),
    ).toBeTruthy();
    expect(screen.getByRole("table", { name: "Calls per day" }).textContent).toContain(
      "Thu, 1 Oct",
    );
  });

  it("puts the range in the subtitle from the page even when analytics failed", () => {
    renderView({ analytics: { ok: false }, from: "2026-09-10", to: "2026-10-09" });
    expect(screen.getByText("Thu, 10 Sep 2026 – Fri, 9 Oct 2026")).toBeTruthy();
    expect(kpi("Calls")).toBe("Calls–");
  });

  it("lists languages by count with their native names, and every outcome in the design's order", () => {
    renderView();
    const lang = screen.getByRole("table", { name: "Calls by language" });
    const rows = within(lang)
      .getAllByRole("row")
      .slice(1)
      .map((r) => r.textContent);
    expect(rows).toEqual(["Kannada6", "English4", "Unknown1", "Hindi0", "Tamil0", "Telugu0"]);
    expect(screen.getByText("ಕನ್ನಡ")).toBeTruthy();
    const outcomes = within(screen.getByRole("table", { name: "Calls by outcome" }))
      .getAllByRole("row")
      .slice(1)
      .map((r) => r.firstChild?.textContent);
    expect(outcomes).toEqual([
      "Booked",
      "Info",
      "Rescheduled",
      "Cancelled",
      "Callback",
      "Handoff",
      "Abandoned",
      "Unknown",
      "weird",
    ]);
  });

  it("shows minutes per month in whole minutes with the included line", () => {
    renderView();
    const minutes = screen.getByRole("table", { name: "Minutes per month" });
    expect(minutes.textContent).toContain("Sep10");
    expect(minutes.textContent).toContain("Oct2");
    expect(screen.getByText("3,000 min included")).toBeTruthy();
  });

  it("hides the included line when the plan's minutes are unknown", () => {
    renderView({ includedMinutes: undefined });
    expect(screen.queryByText(/min included/)).toBeNull();
  });

  it("links the 7, 30 and 90 day ranges and marks the active one", () => {
    renderView();
    const nav = screen.getByRole("navigation", { name: "Range" });
    for (const d of [7, 30, 90]) {
      const link = within(nav).getByRole("link", { name: `${d} days` });
      expect(link.getAttribute("href")).toBe(`/app/analytics?days=${d}`);
      expect(link.getAttribute("aria-current")).toBe(d === 30 ? "page" : null);
    }
  });

  it("falls back per section when a fetch failed", () => {
    renderView({ analytics: { ok: false } });
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert").textContent).toContain("Couldn't load call analytics");
    expect(screen.getByRole("img", { name: "Minutes per month" })).toBeTruthy();
    cleanup();
    renderView({ months: { ok: false } });
    expect(screen.getByRole("alert").textContent).toContain("Couldn't load monthly usage");
    expect(screen.getByRole("img", { name: "Calls by hour" })).toBeTruthy();
  });
});
