// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MonthBars } from "./MonthBars";

afterEach(cleanup);

describe("MonthBars", () => {
  it("labels each month, highlights the last and places the included line", () => {
    render(
      <MonthBars
        title="Minutes per month"
        months={[
          { label: "Sep", value: 2710 },
          { label: "Oct", value: 1842 },
        ]}
        included={3000}
      />,
    );
    expect(screen.getByText("2,710")).toBeTruthy();
    const bars = [...document.querySelectorAll<HTMLElement>("[data-bar]")];
    // Scale is 8% above the larger of the tallest bar and the included minutes.
    expect(bars[0]!.style.height).toBe(`${((2710 / 3240) * 100).toFixed(1)}%`);
    expect(bars[1]!.className).toContain("bg-teal");
    expect(bars[0]!.className).not.toContain("bg-teal");
    const line = document.querySelector<HTMLElement>("[data-included]")!;
    expect(line.style.bottom).toBe(`${((3000 / 3240) * 100).toFixed(1)}%`);
    expect(screen.getByRole("table", { name: "Minutes per month" }).textContent).toContain("Oct");
  });

  it("omits the included line when the plan is unknown", () => {
    render(<MonthBars title="Minutes" months={[{ label: "Oct", value: 0 }]} />);
    expect(document.querySelector("[data-included]")).toBeNull();
    expect(document.querySelector<HTMLElement>("[data-bar]")!.style.height).toBe("0%");
  });
});
