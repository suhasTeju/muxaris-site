// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorPanel } from "./ErrorPanel";

afterEach(cleanup);

describe("ErrorPanel", () => {
  it("calls reset when Try again is pressed and shows the digest", () => {
    const reset = vi.fn();
    render(
      <ErrorPanel error={Object.assign(new Error("x"), { digest: "abc123" })} reset={reset} />,
    );
    expect(screen.getByRole("alert").textContent).toMatch(/abc123/);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("link", { name: "Sign out" })).toBeNull();
  });
  it("prefers retry over reset when Next provides it", () => {
    const reset = vi.fn();
    const retry = vi.fn();
    render(<ErrorPanel error={new Error("x")} reset={reset} retry={retry} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
  });
  it("offers a sign-out link inside the app", () => {
    render(<ErrorPanel error={new Error("x")} reset={() => undefined} signOut />);
    expect(screen.getByRole("link", { name: "Sign out" }).getAttribute("href")).toBe(
      "/sign-in?reason=signout",
    );
  });

  it("goes home from public pages, and fills the page when it replaces one", () => {
    const { container } = render(
      <ErrorPanel error={new Error("x")} reset={() => undefined} fullScreen />,
    );
    expect(screen.getByRole("link", { name: "Go to the home page" }).getAttribute("href")).toBe(
      "/",
    );
    expect(container.firstElementChild?.tagName).toBe("MAIN");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Something went wrong");
  });
});
