// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Progress } from "./Progress";

afterEach(cleanup);

describe("Progress", () => {
  it("collapses to the step line below 1024px", () => {
    render(<Progress step="doctors" maxStep={1} />);
    const line = screen.getByText(/^Step 2 of 5/);
    expect(line.textContent).toBe("Step 2 of 5: Doctors");
    expect(line.querySelector("span")!.className).toContain("lg:hidden");
    expect(screen.getByRole("list").className).toContain("max-lg:hidden");
    expect(screen.getByText(/Progress is saved/).className).toContain("max-lg:hidden");
  });
});
