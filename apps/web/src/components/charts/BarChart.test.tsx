// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { BarChart } from "./BarChart";

afterEach(cleanup);

const base = {
  height: 160,
  gap: 4,
  gridStep: 40,
  ticks: ["Mon", "Tue"],
  barClassName: (v: number, max: number) => (v === max ? "bg-teal" : "bg-[#7fcfc9]"),
};

describe("BarChart", () => {
  it("renders one bar per value and a data table with the same numbers", () => {
    render(
      <BarChart
        {...base}
        title="Calls by day"
        categories={["Mon", "Tue"]}
        series={{ name: "Calls", values: [3, 0] }}
      />,
    );
    expect(screen.getByRole("img", { name: /calls by day/i })).toBeTruthy();
    expect(document.querySelectorAll("[data-bar]")).toHaveLength(2);
    const table = screen.getByRole("table", { name: /calls by day/i });
    expect(table.textContent).toContain("Mon");
    expect(table.textContent).toContain("3");
  });

  it("scales bars to the largest value, colours the max, and never divides by zero", () => {
    render(
      <BarChart
        {...base}
        title="Hours"
        categories={["a", "b", "c"]}
        series={{ name: "x", values: [4, 2, 0] }}
        barTitle={(i) => `bar ${i}`}
      />,
    );
    const bars = [...document.querySelectorAll<HTMLElement>("[data-bar]")];
    expect(bars.map((b) => b.style.height)).toEqual(["100%", "50%", "0%"]);
    expect(bars[0]!.className).toContain("bg-teal");
    expect(bars[1]!.className).toContain("bg-[#7fcfc9]");
    expect(bars[1]!.getAttribute("title")).toBe("bar 1");
    cleanup();
    render(
      <BarChart {...base} title="Empty" categories={["a"]} series={{ name: "x", values: [0] }} />,
    );
    expect(document.querySelector<HTMLElement>("[data-bar]")!.style.height).toBe("0%");
  });

  it("draws the overlay series as a share of each bar and lists both in the table", () => {
    render(
      <BarChart
        {...base}
        title="Calls per day"
        categories={["Mon", "Tue"]}
        series={{ name: "Calls", values: [10, 0] }}
        overlay={{ name: "Booked", values: [4, 0] }}
      />,
    );
    const overlays = [...document.querySelectorAll<HTMLElement>("[data-overlay]")];
    expect(overlays.map((o) => o.style.height)).toEqual(["40%", "0%"]);
    const heads = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(heads).toEqual(["Category", "Calls", "Booked"]);
  });
});
