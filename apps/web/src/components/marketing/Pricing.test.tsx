// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup } from "@testing-library/react";
import { Pricing } from "./Pricing";

afterEach(cleanup);

describe("Pricing", () => {
  it("renders both plans with their prices and calls to action", () => {
    render(<Pricing />);
    const pilot = screen.getByRole("heading", { name: "Pilot" }).closest("article")!;
    const standard = screen.getByRole("heading", { name: "Standard" }).closest("article")!;
    expect(within(pilot).getByText("₹0")).toBeTruthy();
    expect(within(pilot).getByText(/up to 500 calls/i)).toBeTruthy();
    expect(within(standard).getByText("₹4,999")).toBeTruthy();
    expect(within(standard).getByText(/3,000 call-minutes/i)).toBeTruthy();
    expect(within(standard).getByRole("link", { name: "Book a demo" }).getAttribute("href")).toBe(
      "/#demo",
    );
  });
});
