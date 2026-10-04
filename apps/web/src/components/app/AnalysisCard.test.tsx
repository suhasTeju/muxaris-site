// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Call } from "@muxaris/shared";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ useApi: () => api }));

import { AnalysisCard } from "./AnalysisCard";

afterEach(() => {
  cleanup();
  api.mockReset();
  vi.useRealTimers();
});

const call = (over: Partial<Call> = {}) =>
  ({
    id: "c1",
    endedAt: new Date(Date.now() - 60_000).toISOString(),
    summary: null,
    sentiment: null,
    analysis: null,
    analysedAt: null,
    ...over,
  }) as unknown as Call;

describe("AnalysisCard", () => {
  it("shows the summary, sentiment and entities", () => {
    render(
      <AnalysisCard
        call={call({
          summary: "Caller booked a cleaning.",
          sentiment: "positive",
          analysedAt: new Date().toISOString(),
          analysis: { entities: { service: "Cleaning", day: "Tuesday" }, needsCallback: false },
        })}
        onCall={vi.fn()}
      />,
    );
    expect(screen.getByText("Caller booked a cleaning.")).toBeTruthy();
    expect(screen.getByText("Positive")).toBeTruthy();
    expect(screen.getByText("Cleaning")).toBeTruthy();
  });

  it("never invents a summary for a call with no caller speech", () => {
    render(
      <AnalysisCard
        call={call({ analysedAt: new Date().toISOString(), analysis: { skipped: "no_turns" } })}
        onCall={vi.fn()}
      />,
    );
    expect(screen.getByText("No caller speech to summarise.")).toBeTruthy();
  });

  it("shows Summary pending and polls every 10 s for a recent call", async () => {
    vi.useFakeTimers();
    const onCall = vi.fn();
    api.mockResolvedValue({
      call: call({ summary: "Done.", analysedAt: new Date().toISOString() }),
    });
    render(<AnalysisCard call={call()} onCall={onCall} />);
    expect(screen.getByText("Summary pending")).toBeTruthy();
    expect(api).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(api).toHaveBeenCalledWith("/v1/calls/c1");
    expect(onCall).toHaveBeenCalledWith(expect.objectContaining({ summary: "Done." }));
  });

  it("stops polling after two minutes", async () => {
    vi.useFakeTimers();
    api.mockResolvedValue({ call: call() });
    render(<AnalysisCard call={call()} onCall={vi.fn()} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(screen.getByText("No summary available")).toBeTruthy();
    const n = api.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(api.mock.calls.length).toBe(n);
  });

  it("says no summary available for an old, never-analysed call without polling", () => {
    render(
      <AnalysisCard
        call={call({ endedAt: new Date(Date.now() - 3_600_000).toISOString() })}
        onCall={vi.fn()}
      />,
    );
    expect(screen.getByText("No summary available")).toBeTruthy();
    expect(api).not.toHaveBeenCalled();
  });
});
