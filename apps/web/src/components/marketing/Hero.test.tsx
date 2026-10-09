// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Hero } from "./Hero";

afterEach(cleanup);

describe("Hero", () => {
  it("renders the fixed headline verbatim", () => {
    render(<Hero />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "Your front desk misses calls. Muxaris doesn’t.",
    );
  });

  it("places the NVIDIA Inception badge at its design size, smaller than the wordmark", () => {
    render(<Hero />);
    const badge = screen.getByAltText("NVIDIA Inception Program");
    expect(badge.getAttribute("width")).toBe("83");
    expect(badge.getAttribute("height")).toBe("36");
    expect(Number(badge.getAttribute("width"))).toBeLessThanOrEqual(120);
  });

  it("links both calls to action into the page", () => {
    render(<Hero />);
    expect(screen.getByRole("link", { name: /Book a demo/ }).getAttribute("href")).toBe("/#demo");
    expect(screen.getByRole("link", { name: /Hear a sample call/ }).getAttribute("href")).toBe(
      "/#live-demo",
    );
  });
});
