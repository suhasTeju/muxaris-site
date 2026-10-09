// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import NotFound from "./not-found";

afterEach(cleanup);

describe("NotFound", () => {
  it("explains the missing page and links home", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "We couldn’t find that page",
    );
    expect(screen.getByText("404 · Muxaris")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to the home page" }).getAttribute("href")).toBe(
      "/",
    );
  });
});
