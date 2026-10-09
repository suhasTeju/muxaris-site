// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NAV_OFFSET, SiteLink } from "./SiteLink";

vi.mock("next/navigation", () => ({ usePathname: () => "/pricing" }));

let scrollTo: ReturnType<typeof vi.fn>;
beforeEach(() => {
  scrollTo = vi.fn();
  vi.stubGlobal("scrollTo", scrollTo);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

function target(id: string, top: number) {
  const el = document.createElement("section");
  el.id = id;
  el.getBoundingClientRect = () => ({ top }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

describe("SiteLink", () => {
  it("glides to a target on the current page, 90px below the top, and focuses it", () => {
    const el = target("pricing-faq", 800);
    render(<SiteLink href="/pricing#pricing-faq">Go</SiteLink>);
    const pushState = vi.spyOn(window.history, "pushState");
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    fireEvent(screen.getByRole("link", { name: "Go" }), event);
    expect(event.defaultPrevented).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith({ top: 800 - NAV_OFFSET, behavior: "smooth" });
    expect(pushState).toHaveBeenCalledWith(null, "", "/pricing#pricing-faq");
    expect(document.activeElement).toBe(el);
  });

  it("stays on this page for a `stay` link when the page has the target", () => {
    target("demo", 2000);
    render(
      <SiteLink href="/#demo" stay>
        Book
      </SiteLink>,
    );
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    fireEvent(screen.getByRole("link", { name: "Book" }), event);
    expect(event.defaultPrevented).toBe(true);
    expect(scrollTo).toHaveBeenCalled();
  });

  it("navigates normally to another page's section", () => {
    // Stop jsdom's own navigation (the default action) once React has handled the click.
    const stop = (e: Event) => e.preventDefault();
    window.addEventListener("click", stop);
    target("how", 500);
    render(<SiteLink href="/#how">How</SiteLink>);
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    fireEvent(screen.getByRole("link", { name: "How" }), event);
    expect(scrollTo).not.toHaveBeenCalled();
    window.removeEventListener("click", stop);
  });
});
