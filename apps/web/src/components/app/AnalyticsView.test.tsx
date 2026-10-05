// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { CallAnalytics, MonthlyUsage } from "@muxaris/shared";
import { AnalyticsView } from "./AnalyticsView";

afterEach(cleanup);

const byHour = Array.from({ length: 24 }, (_, h) => (h === 11 ? 5 : 0));
const analytics: CallAnalytics = {
  from: "2026-10-01",
  to: "2026-10-07",
  totalCalls: 10,
  bookedCalls: 5,
  bookingConversion: 0.5,
  avgDurationS: 125,
  byOutcome: { booked: 5, info: 5 },
  byLanguage: { "kn-IN": 6, "en-IN": 4 },
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
      tz="Asia/Kolkata"
      {...props}
    />,
  );
}

describe("AnalyticsView", () => {
  it("renders the charts, KPI strip and localized labels", () => {
    renderView();
    for (const t of ["Calls per day", "Calls by hour", "Calls by language", "Minutes per month"]) {
      expect(screen.getByRole("img", { name: t })).toBeTruthy();
    }
    expect(screen.getByText("Booking rate").parentElement?.textContent).toContain("50%");
    expect(screen.getByText("Average call").parentElement?.textContent).toMatch(/\d/);
    const langTable = screen.getByRole("table", { name: "Calls by language" });
    expect(langTable.textContent).toContain("Kannada");
    expect(langTable.textContent).not.toContain("kn-IN");
    const minutes = screen.getByRole("table", { name: "Minutes per month" });
    expect(minutes.textContent).toContain("2026-10");
    expect(minutes.textContent).toContain("2");
  });

  it("links the 7, 30 and 90 day ranges and marks the active one", () => {
    renderView();
    for (const d of [7, 30, 90]) {
      const link = screen.getByRole("link", { name: `${d} days` });
      expect(link.getAttribute("href")).toBe(`/app/analytics?days=${d}`);
      expect(link.getAttribute("aria-current")).toBe(d === 30 ? "page" : null);
    }
  });

  it("falls back per section when a fetch failed", () => {
    renderView({ analytics: { ok: false } });
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("img", { name: "Minutes per month" })).toBeTruthy();
  });
});
