// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Reveal } from "./Reveal";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubMotion(reduced: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: reduced && q.includes("reduce"),
    addEventListener() {},
    removeEventListener() {},
  }));
}

describe("Reveal", () => {
  it("shows content immediately under prefers-reduced-motion", () => {
    stubMotion(true);
    const { getByText } = render(<Reveal>hi</Reveal>);
    const el = getByText("hi");
    expect(el.hasAttribute("data-in")).toBe(true);
    expect(el.hasAttribute("data-instant")).toBe(true);
  });

  it("waits for the observer when below the fold, with a capped delay", () => {
    stubMotion(false);
    const observe = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe = observe;
        disconnect() {}
      },
    );
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      top: 5000,
    } as DOMRect);
    const { getByText } = render(<Reveal delay={900}>below</Reveal>);
    const el = getByText("below");
    expect(el.hasAttribute("data-in")).toBe(false);
    expect(observe).toHaveBeenCalled();
    expect(el.style.transitionDelay).toBe("180ms");
  });

  it("appears instantly when already above the fold", () => {
    stubMotion(false);
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      top: 100,
    } as DOMRect);
    const { getByText } = render(<Reveal>top</Reveal>);
    expect(getByText("top").hasAttribute("data-instant")).toBe(true);
  });
});
