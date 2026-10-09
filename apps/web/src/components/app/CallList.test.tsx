// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Call } from "@muxaris/shared";
import { CallList } from "./CallList";

afterEach(cleanup);

describe("CallList", () => {
  it("never renders a caller's full phone number", () => {
    const calls = [
      {
        id: "c1",
        startedAt: "2026-10-06T04:00:00Z",
        channel: "phone",
        callerPhoneMasked: "+91 •••• ••3210",
        durationS: 30,
        languageDetected: "en-IN",
        outcome: "info",
        status: "completed",
      },
    ] as unknown as Call[];
    const { container } = render(<CallList calls={calls} tz="Asia/Kolkata" />);
    expect(screen.getByText("+91 •••• ••3210")).toBeTruthy();
    expect(container.textContent).not.toContain("9876543210");
  });

  it("labels a swept call as Abandoned rather than In progress", () => {
    const calls = [
      {
        id: "c2",
        startedAt: "2026-10-06T04:00:00Z",
        channel: "phone",
        callerPhoneMasked: null,
        durationS: 1200,
        languageDetected: null,
        outcome: "info",
        status: "abandoned",
      },
    ] as unknown as Call[];
    render(<CallList calls={calls} tz="Asia/Kolkata" />);
    expect(screen.getByText("Abandoned", { selector: "span" })).toBeTruthy();
    expect(screen.queryByText("In progress")).toBeNull();
  });
});

describe("CallList design", () => {
  const base = {
    channel: "phone",
    patientId: null,
    callerPhoneMasked: "+91 •••• ••0192",
    durationS: 41,
    languageDetected: "hi-IN",
    outcome: "callback",
    status: "completed",
  };
  const calls = [
    {
      ...base,
      id: "c9",
      startedAt: "2026-10-09T08:22:00Z",
      patientId: "p5",
      patientName: "Priya Venkatesh",
    },
    { ...base, id: "c8", startedAt: "2026-10-09T07:50:00Z", channel: "browser" },
    { ...base, id: "c1", startedAt: "2026-10-08T14:44:00Z", status: "failed" },
    { ...base, id: "c13", startedAt: "2026-10-07T14:18:00Z" },
  ] as unknown as Call[];

  it("groups by day with Today and Yesterday labels in the clinic timezone", () => {
    render(<CallList calls={calls} tz="Asia/Kolkata" now={new Date("2026-10-09T08:40:00Z")} />);
    expect(screen.getByText("Today · Fri, 9 Oct 2026")).toBeTruthy();
    expect(screen.getByText("Yesterday · Thu, 8 Oct 2026")).toBeTruthy();
    expect(screen.getByText("Wed, 7 Oct 2026")).toBeTruthy();
  });

  it("names known patients over their masked number and labels test calls", () => {
    render(<CallList calls={calls} tz="Asia/Kolkata" now={new Date("2026-10-09T08:40:00Z")} />);
    const link = screen.getByRole("link", { name: /Priya Venkatesh/ });
    expect(link.getAttribute("href")).toBe("/app/calls/c9");
    const row = link.closest('[role="row"]')!;
    expect(row.textContent).toContain("+91 •••• ••0192");
    expect(row.textContent).toContain("1:52 pm");
    expect(row.textContent).toContain("0m 41s");
    expect(row.textContent).toContain("Hindi");
    expect(screen.getByText("Test call")).toBeTruthy();
  });

  it("draws the status as an outline badge, grey for completed and toned otherwise", () => {
    render(<CallList calls={calls} tz="Asia/Kolkata" now={new Date("2026-10-09T08:40:00Z")} />);
    expect(screen.getAllByText("Completed")[0]!.className).toContain("border-line");
    expect(screen.getByText("Failed").className).toContain("text-bad-fg");
  });

  it("offers a test call when there are no calls and no filter", () => {
    render(<CallList calls={[]} tz="Asia/Kolkata" />);
    expect(screen.getByText(/No calls yet/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Place a test call" }).getAttribute("href")).toBe(
      "/app/assistant/try",
    );
  });

  it("scrolls the table sideways inside its card on narrow screens", () => {
    render(<CallList calls={calls} tz="Asia/Kolkata" now={new Date("2026-10-09T08:40:00Z")} />);
    const table = screen.getByRole("table", { name: "Calls" });
    expect(table.className).toContain("min-w-[940px]");
    expect(table.parentElement!.className).toContain("overflow-x-auto");
  });

  it("exposes table semantics: headers, a row per call and a link in each row", () => {
    render(<CallList calls={calls} tz="Asia/Kolkata" now={new Date("2026-10-09T08:40:00Z")} />);
    const table = screen.getByRole("table", { name: "Calls" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["When", "Caller", "Duration", "Language", "Outcome", "Status", ""]);
    // Header + 3 day groups + 4 calls.
    expect(within(table).getAllByRole("row")).toHaveLength(8);
    const group = within(table).getByText("Today · Fri, 9 Oct 2026");
    expect(group.getAttribute("role")).toBe("cell");
    expect(group.getAttribute("aria-colspan")).toBe("7");
    const row = within(table)
      .getByRole("link", { name: /Test call/ })
      .closest('[role="row"]')!;
    expect(within(row as HTMLElement).getAllByRole("cell")).toHaveLength(7);
    expect(within(table).getAllByRole("link")).toHaveLength(4);
  });
});
