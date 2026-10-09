// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FaqPage from "@/app/faq/page";
import NotFound from "@/app/not-found";
import PricingPage from "@/app/pricing/page";
import PrivacyPage from "@/app/privacy/page";
import TermsPage from "@/app/terms/page";
import { ErrorPanel } from "@/components/errors/ErrorPanel";
import { Landing } from "./Landing";

// Below 1024px the site stacks to one column with 16px gutters and smaller display type; the
// desktop values sit behind sm:/md:/lg: so 1024 and up stays pixel-identical to the design.

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const classes = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/);
/** Unprefixed grid-cols-* utilities, which would force columns on a phone. */
function phoneColumns(root: Element) {
  return [...root.querySelectorAll("[class*='grid-cols-']")].flatMap((el) =>
    classes(el).filter((c) => c.startsWith("grid-cols-")),
  );
}
const h1 = () => screen.getByRole("heading", { level: 1 });

describe("responsive site", () => {
  it("landing: phone-sized headlines and one column below the breakpoints", () => {
    const { container } = render(<Landing signedIn={false} />);
    expect(classes(h1())).toEqual(
      expect.arrayContaining(["text-[40px]", "sm:text-[clamp(48px,5.6vw,80px)]"]),
    );
    const headlines = container.querySelectorAll("[class*='clamp(36px,4vw,54px)']");
    expect(headlines.length).toBeGreaterThanOrEqual(9);
    for (const h of headlines) {
      expect(classes(h)).toEqual(
        expect.arrayContaining(["text-[32px]", "sm:text-[clamp(36px,4vw,54px)]"]),
      );
    }
    expect(phoneColumns(container)).toEqual([]);
    // The three-up cards stack until 1024px.
    const threeUp = [...container.querySelectorAll("ol")].filter((ol) =>
      classes(ol).some((c) => c.endsWith("grid-cols-3")),
    );
    expect(threeUp).toHaveLength(2);
    for (const ol of threeUp) expect(classes(ol)).toContain("lg:grid-cols-3");
  });

  it("nav: links collapse into the menu button below 1024px", () => {
    render(<Landing signedIn={false} />);
    const links = screen.getByRole("navigation", { name: "Primary" }).querySelector("ul")!;
    expect(classes(links)).toEqual(expect.arrayContaining(["hidden", "lg:flex"]));
    expect(classes(screen.getByRole("button", { name: "Open menu" }))).toContain("lg:hidden");
  });

  it.each([
    ["pricing", PricingPage],
    ["faq", FaqPage],
  ])("%s: 40px page title on phones, no forced columns", (_, Page) => {
    const { container } = render(<Page />);
    expect(classes(h1())).toEqual(
      expect.arrayContaining(["text-[40px]", "sm:text-[clamp(46px,5.4vw,76px)]"]),
    );
    expect(phoneColumns(container)).toEqual([]);
  });

  it.each([
    ["privacy", PrivacyPage],
    ["terms", TermsPage],
  ])("%s: the index sits above the text until 1024px", (_, Page) => {
    const { container } = render(<Page />);
    expect(classes(h1())).toEqual(expect.arrayContaining(["text-[40px]", "sm:text-[60px]"]));
    expect(phoneColumns(container)).toEqual([]);
    expect(container.querySelector("[class*='lg:grid-cols-[240px_minmax(0,1fr)]']")).not.toBeNull();
  });

  it("404 and error: titles step down on phones", () => {
    render(<NotFound />);
    expect(classes(h1())).toEqual(expect.arrayContaining(["text-[40px]", "sm:text-[48px]"]));
    cleanup();
    render(<ErrorPanel error={new Error("x")} reset={() => undefined} fullScreen />);
    expect(classes(h1())).toEqual(expect.arrayContaining(["text-[36px]", "sm:text-[48px]"]));
  });
});
