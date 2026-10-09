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

  it("subtracts recorderT0Ms so turns line up with the recording", () => {
    const onSeek = vi.fn();
    render(
      <SyncedTranscript
        turns={turns}
        callStartedAt={START}
        recorderT0Ms={1500}
        currentTimeMs={2500}
        onSeek={onSeek}
      />,
    );
    // Turn 2 starts 4000 ms after the call, i.e. 2500 ms into the recording.
    expect(screen.getByRole("button", { current: true }).textContent).toContain(
      "I need a cleaning",
    );
    fireEvent.click(screen.getByRole("button", { name: /Booked for Tuesday/ }));
    expect(onSeek).toHaveBeenCalledWith(7500);
  });

  it("keeps offsets monotonic in seq even if a later turn is stamped earlier", () => {
    const onSeek = vi.fn();
    render(
      <SyncedTranscript
        turns={[turn(1, "user", "First", 5000), turn(2, "assistant", "Second", 3000)]}
        callStartedAt={START}
        currentTimeMs={null}
        onSeek={onSeek}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Second/ }));
    expect(onSeek).toHaveBeenCalledWith(5000);
  });

  it("shows whether a tool call succeeded", () => {
    const t = (seq: number, toolStatus: "ok" | "error") =>
      ({ ...turn(seq, "tool", null, seq * 1000), toolStatus }) as CallTurn;
    render(
      <SyncedTranscript
        turns={[t(1, "ok"), t(2, "error")]}
        callStartedAt={START}
        currentTimeMs={null}
        onSeek={vi.fn()}
      />,
    );
    expect(screen.getByText("· done")).toBeTruthy();
    expect(screen.getByText("· failed")).toBeTruthy();
  });

  it("says so when there is no transcript", () => {
    render(
      <SyncedTranscript turns={[]} callStartedAt={START} currentTimeMs={null} onSeek={vi.fn()} />,
    );
    expect(screen.getByText("No transcript was recorded for this call.")).toBeTruthy();
  });

  it("shows a given note instead, such as the purge message", () => {
    render(
      <SyncedTranscript
        turns={[]}
        emptyNote="Deleted after 90 days."
        callStartedAt={START}
        currentTimeMs={null}
        onSeek={vi.fn()}
      />,
    );
    expect(screen.getByText("Deleted after 90 days.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("labels each turn with the speaker and its clock offset", () => {
    render(
      <SyncedTranscript
        turns={turns}
        callStartedAt={START}
        currentTimeMs={null}
        onSeek={vi.fn()}
      />,
    );
    expect(screen.getByText("Caller · 0:04")).toBeTruthy();
    expect(screen.getByText("Assistant · 0:09")).toBeTruthy();
  });
});
