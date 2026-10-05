// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
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
