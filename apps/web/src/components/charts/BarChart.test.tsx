// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { BarChart } from "./BarChart";

afterEach(cleanup);

describe("BarChart", () => {
  it("renders one bar per value and a data table with the same numbers", () => {
    render(
      <BarChart
        title="Calls by day"
        categories={["Mon", "Tue"]}
        series={[{ name: "Calls", values: [3, 0] }]}
      />,
    );
    expect(screen.getByRole("img", { name: /calls by day/i })).toBeTruthy();
    expect(document.querySelectorAll("rect[data-bar]")).toHaveLength(2);
    const table = screen.getByRole("table", { name: /calls by day/i });
    expect(table.textContent).toContain("Mon");
    expect(table.textContent).toContain("3");
  });

  it("scales bars to the largest value and never divides by zero", () => {
    render(<BarChart title="Empty" categories={["a"]} series={[{ name: "x", values: [0] }]} />);
    const bar = document.querySelector("rect[data-bar]") as SVGRectElement;
    expect(Number(bar.getAttribute("height"))).toBe(0);
  });
});
