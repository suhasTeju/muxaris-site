// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TRANSCRIPT } from "@/lib/content";
import { LiveDemo } from "./LiveDemo";

let reduced = false;
const paused = new WeakMap<HTMLMediaElement, boolean>();

beforeEach(() => {
  reduced = false;
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduced && query.includes("reduce"),
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
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
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const lines = () =>
  within(screen.getByRole("list", { name: "Call transcript" })).queryAllByRole("listitem");

describe("LiveDemo", () => {
  it("starts at the first line, still booking", () => {
    render(<LiveDemo signedIn={false} />);
    expect(lines()).toHaveLength(1);
    expect(lines()[0]!.textContent).toContain("Caller · 0:00");
    expect(screen.getByText(/Booking · Sunrise Dental Care/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Try it live" })).toBeNull();
  });

  it("shows the whole call, booked, at the end of the script", () => {
    render(<LiveDemo signedIn initialTime={19.6} loop={false} />);
    expect(lines()).toHaveLength(TRANSCRIPT.length);
    expect(lines().map((l) => l.textContent?.split(" · ")[1]?.slice(0, 4))).toEqual([
      "0:00",
      "0:04",
      "0:10",
      "0:13",
    ]);
    expect(screen.getByText(/Booked · Sunrise Dental Care/)).toBeTruthy();
    const steps = screen.getAllByRole("listitem").filter((li) => li.hasAttribute("aria-current"));
    expect(steps).toHaveLength(1);
    expect(steps[0]!.textContent).toContain("On your dashboard");
    expect(screen.getByRole("link", { name: "Try it live" }).getAttribute("href")).toBe(
      "/app/assistant/try",
    );
  });

  it("shows the finished call and never animates under reduced motion", () => {
    reduced = true;
    vi.useFakeTimers();
    render(<LiveDemo />);
    expect(lines()).toHaveLength(TRANSCRIPT.length);
    expect(screen.getByText(/Booked/)).toBeTruthy();
  });

  it("plays the real clip from the start and follows it", () => {
    vi.useFakeTimers();
    render(<LiveDemo initialTime={19.6} loop={false} />);
    const audio = document.querySelector("audio")!;
    expect(audio.getAttribute("src")).toBe("/audio/sample-call.m4a");
    fireEvent.click(screen.getByRole("button", { name: "Play audio" }));
    expect(lines()).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Pause audio" })).toBeTruthy();
    Object.defineProperty(audio, "currentTime", { configurable: true, value: 11 });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(lines()).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Pause audio" }));
    expect(screen.getByRole("button", { name: "Play audio" })).toBeTruthy();
  });
});
