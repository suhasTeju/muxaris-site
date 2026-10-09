// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Badge } from "./Badge";
import { BADGES, TONES, badgeFor } from "./tones";

afterEach(cleanup);

describe("Badge", () => {
  it("renders the label with the tone's colours and a dot", () => {
    render(<Badge tone="bad">Cancelled</Badge>);
    const badge = screen.getByText("Cancelled");
    expect(badge.className).toContain("bg-bad-bg");
    expect(badge.className).toContain("text-bad-fg");
    expect(badge.className).toContain("h-[22px]");
    const dot = badge.querySelector("span[aria-hidden='true']");
    expect(dot?.className).toContain("bg-bad-dot");
  });

  it("outline badges have a tone border and no dot by default", () => {
    render(
      <Badge tone="info" variant="outline">
        In progress
      </Badge>,
    );
    const badge = screen.getByText("In progress");
    expect(badge.className).toContain("border-info-bg");
    expect(badge.className).not.toContain("bg-info-bg");
    expect(badge.querySelector("span[aria-hidden='true']")).toBeNull();
  });

  it("sizes follow the design heights", () => {
    render(
      <Badge tone="good" size={24} dot={false}>
        Standard
      </Badge>,
    );
    const badge = screen.getByText("Standard");
    expect(badge.className).toContain("h-[24px]");
    expect(badge.className).toContain("rounded-7");
    expect(badge.querySelector("span[aria-hidden='true']")).toBeNull();
  });
});

describe("tones", () => {
  it("matches the design's TONES map", () => {
    expect(TONES.good).toEqual({ bg: "#e7f6ec", fg: "#15803d", dot: "#16a34a" });
    expect(TONES.warn).toEqual({ bg: "#fdf1dc", fg: "#8a4b00", dot: "#d98a14" });
    expect(TONES.bad).toEqual({ bg: "#fdecef", fg: "#b4234a", dot: "#e04870" });
    expect(TONES.muted).toEqual({ bg: "#eef2f6", fg: "#4a5566", dot: "#8a95a5" });
    expect(TONES.info).toEqual({ bg: "#e3f4f3", fg: "#0b6b70", dot: "#0e9a96" });
  });

  it("maps statuses to the design's labels and tones", () => {
    expect(badgeFor("appt", "no_show")).toEqual({ label: "No-show", tone: "bad" });
    expect(badgeFor("outcome", "handoff")).toEqual({ label: "Handoff", tone: "info" });
    expect(badgeFor("notif", "skipped")).toEqual({ label: "Not sent", tone: "muted" });
    expect(badgeFor("cb", "open")).toEqual({ label: "Open", tone: "warn" });
    expect(badgeFor("outcome", null)).toEqual({ label: "Not set", tone: "muted" });
    expect(Object.keys(BADGES)).toEqual([
      "appt",
      "outcome",
      "status",
      "notif",
      "priority",
      "sentiment",
      "cb",
    ]);
  });
});
