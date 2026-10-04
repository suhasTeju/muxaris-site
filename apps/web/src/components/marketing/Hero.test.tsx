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
});
