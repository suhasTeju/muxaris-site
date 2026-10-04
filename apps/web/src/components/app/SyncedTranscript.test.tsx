// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CallTurn } from "@muxaris/shared";
import { SyncedTranscript } from "./SyncedTranscript";

afterEach(cleanup);

const START = "2026-10-06T04:00:00.000Z";
const turn = (seq: number, role: CallTurn["role"], text: string | null, plusMs: number) =>
  ({
    id: `t${seq}`,
    seq,
    role,
    text,
    toolName: role === "tool" ? "book_appointment" : null,
    startedAt: new Date(Date.parse(START) + plusMs).toISOString(),
  }) as unknown as CallTurn;

const turns = [
  turn(1, "assistant", "Hello, how can I help?", 0),
  turn(2, "user", "I need a cleaning", 4000),
  turn(3, "tool", null, 6000),
  turn(4, "assistant", "Booked for Tuesday", 9000),
];

describe("SyncedTranscript", () => {
  it("marks the turn whose window contains currentTimeMs", () => {
    const { rerender } = render(
      <SyncedTranscript
        turns={turns}
        callStartedAt={START}
        currentTimeMs={5000}
        onSeek={vi.fn()}
      />,
    );
    const current = screen.getByRole("button", { current: true });
    expect(current.textContent).toContain("I need a cleaning");
    rerender(
      <SyncedTranscript
        turns={turns}
        callStartedAt={START}
        currentTimeMs={9000}
        onSeek={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { current: true }).textContent).toContain(
      "Booked for Tuesday",
    );
    expect(screen.getAllByRole("button", { current: true })).toHaveLength(1);
  });

  it("marks nothing before playback starts", () => {
    render(
      <SyncedTranscript
        turns={turns}
        callStartedAt={START}
        currentTimeMs={null}
        onSeek={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { current: true })).toBeNull();
  });

  it("seeks to the turn offset when a turn is clicked", () => {
    const onSeek = vi.fn();
    render(
      <SyncedTranscript turns={turns} callStartedAt={START} currentTimeMs={null} onSeek={onSeek} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Booked for Tuesday/ }));
    expect(onSeek).toHaveBeenCalledWith(9000);
  });

  it("renders tool turns as non-interactive chips", () => {
    render(
      <SyncedTranscript
        turns={turns}
        callStartedAt={START}
        currentTimeMs={null}
        onSeek={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(screen.getByText(/book_appointment/)).toBeTruthy();
  });

  it("clamps offsets of turns logged before the call start to zero", () => {
    const onSeek = vi.fn();
    render(
      <SyncedTranscript
        turns={[turn(1, "assistant", "Early", -500)]}
        callStartedAt={START}
        currentTimeMs={null}
        onSeek={onSeek}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Early/ }));
    expect(onSeek).toHaveBeenCalledWith(0);
  });

  it("says so when there is no transcript", () => {
    render(
      <SyncedTranscript turns={[]} callStartedAt={START} currentTimeMs={null} onSeek={vi.fn()} />,
    );
    expect(screen.getByText("No transcript was recorded for this call.")).toBeTruthy();
  });
});
