// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TranscriptPane, type TranscriptLine } from "./TranscriptPane";

const scroll = vi.fn();

function prefersReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: reduce && query === "(prefers-reduced-motion: reduce)",
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

const LINES: TranscriptLine[] = [
  { role: "assistant", text: "Namaskara, Sunrise Dental Care." },
  { role: "user", text: "Can I see the doctor tomorrow?" },
];

beforeEach(() => {
  Element.prototype.scrollIntoView = scroll;
});

afterEach(() => {
  cleanup();
  scroll.mockReset();
});

describe("TranscriptPane", () => {
  it("scrolls the newest line into view smoothly", () => {
    prefersReducedMotion(false);
    const { rerender } = render(<TranscriptPane lines={LINES.slice(0, 1)} idle={false} />);
    rerender(<TranscriptPane lines={LINES} idle={false} />);
    expect(scroll).toHaveBeenLastCalledWith({ block: "nearest", behavior: "smooth" });
    expect(scroll.mock.contexts.at(-1)).toBe(
      screen.getByText("Can I see the doctor tomorrow?").closest("li"),
    );
  });

  it("jumps instead of scrolling, and does not animate the bubbles, under reduced motion", () => {
    prefersReducedMotion(true);
    render(<TranscriptPane lines={LINES} idle={false} />);
    expect(scroll).toHaveBeenLastCalledWith({ block: "nearest", behavior: "auto" });
    for (const li of screen.getAllByRole("listitem")) {
      expect(li.className).toContain("animate-mx-in");
      expect(li.className).toContain("motion-reduce:animate-none");
    }
  });

  it("shows the idle prompt before the first line", () => {
    prefersReducedMotion(false);
    render(<TranscriptPane lines={[]} idle />);
    expect(screen.getByText("Say hello. The conversation appears here.")).toBeTruthy();
    expect(scroll).not.toHaveBeenCalled();
  });
});
