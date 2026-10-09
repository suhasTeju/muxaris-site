// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GREETINGS } from "@/lib/content";
import { Languages } from "./Languages";
import { barHeights } from "./SamplePlayer";

const paused = new WeakMap<HTMLMediaElement, boolean>();

beforeEach(() => {
  Object.defineProperty(HTMLMediaElement.prototype, "paused", {
    configurable: true,
    get(this: HTMLMediaElement) {
      return paused.get(this) ?? true;
    },
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    paused.set(this, false);
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    paused.set(this, true);
    this.dispatchEvent(new Event("pause"));
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Languages", () => {
  it("lists the five real greeting clips with their lengths", () => {
    render(<Languages />);
    const srcs = [...document.querySelectorAll("audio")].map((a) => a.getAttribute("src"));
    expect(srcs).toEqual(["en", "hi", "kn", "ta", "te"].map((c) => `/audio/greet-${c}.m4a`));
    for (const g of GREETINGS) expect(screen.getByText(`${g.seconds.toFixed(1)}s`)).toBeTruthy();
  });

  it("plays one clip at a time", () => {
    render(<Languages />);
    fireEvent.click(screen.getByRole("button", { name: "Play English greeting" }));
    expect(screen.getAllByRole("button", { name: "Pause" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Play Hindi greeting" }));
    const audios = [...document.querySelectorAll("audio")];
    expect(audios.map((a) => a.paused)).toEqual([true, false, true, true, true]);
    expect(screen.getAllByRole("button", { name: "Pause" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Play English greeting" })).toBeTruthy();
  });
});

describe("barHeights", () => {
  it("draws 28 bars between 6 and 30 px that differ per language", () => {
    const rows = GREETINGS.map((_, i) => barHeights(i));
    for (const r of rows) {
      expect(r).toHaveLength(28);
      expect(Math.min(...r)).toBeGreaterThanOrEqual(6);
      expect(Math.max(...r)).toBeLessThanOrEqual(30);
    }
    expect(new Set(rows.map((r) => r.join())).size).toBe(rows.length);
    expect(barHeights(0)[0]).toBe(6);
  });
});
