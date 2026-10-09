// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Nav } from "./Nav";

afterEach(cleanup);

describe("Nav", () => {
  it("links the sections, pricing, FAQ, sign-in and the demo form", () => {
    render(<Nav />);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    const href = (name: string) => within(nav).getByRole("link", { name }).getAttribute("href");
    expect(href("Muxaris home")).toBe("/");
    expect(href("How it works")).toBe("/#how");
    expect(href("Languages")).toBe("/#languages");
    expect(href("Pricing")).toBe("/pricing");
    expect(href("FAQ")).toBe("/faq");
    expect(href("Sign in")).toBe("/sign-in");
    expect(href("Book a demo")).toBe("/#demo");
  });

  it("opens the mobile menu and closes it with Escape or a link", () => {
    render(<Nav />);
    const button = screen.getByRole("button", { name: "Open menu" });
    expect(button.getAttribute("aria-controls")).toBe("mobile-menu");
    expect(document.getElementById("mobile-menu")).toBeNull();

    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.getAttribute("aria-label")).toBe("Close menu");
    const menu = document.getElementById("mobile-menu")!;
    // The panel's entrance animation is skipped under reduced motion.
    expect(menu.closest("[class*='animate-']")?.className).toContain("motion-reduce:animate-none");
    expect(
      within(menu)
        .getAllByRole("link")
        .map((a) => a.getAttribute("href")),
    ).toEqual(["/#how", "/#languages", "/pricing", "/faq", "/sign-in", "/#demo"]);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.getElementById("mobile-menu")).toBeNull();

    // Stop jsdom's own navigation (the default action) once React has handled the click.
    const stop = (e: Event) => e.preventDefault();
    window.addEventListener("click", stop);
    fireEvent.click(button);
    const menuNow = document.getElementById("mobile-menu")!;
    fireEvent.click(within(menuNow).getByRole("link", { name: "FAQ" }));
    expect(document.getElementById("mobile-menu")).toBeNull();
    window.removeEventListener("click", stop);
  });
});
