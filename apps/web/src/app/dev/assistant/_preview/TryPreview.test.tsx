// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clinic } from "@/components/dev/fixtures";
import { TryPreview } from "./TryPreview";

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

/** The real voice hook against the fixture gateway: proves each preview reaches its state. */
describe("Try preview fixture voice client", () => {
  it("runs a whole call to the booking and the end", async () => {
    render(<TryPreview clinic={clinic} state="ended" />);
    fireEvent.click(screen.getByRole("button", { name: "Start call" }));
    await waitFor(() => expect(screen.getByTestId("state-label").textContent).toBe("Call ended"));
    const lines = within(screen.getByRole("region", { name: "Conversation" })).getAllByRole(
      "listitem",
    );
    expect(lines.map((l) => l.getAttribute("data-role"))).toEqual([
      "assistant",
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
    const tools = within(screen.getByRole("region", { name: "What the assistant is doing" }));
    expect(tools.getAllByRole("listitem").map((l) => l.getAttribute("data-status"))).toEqual([
      "done",
      "done",
      "done",
      "done",
    ]);
    expect(tools.getByText("2 slots")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Appointment booked" }).textContent).toContain(
      "Consultation",
    );
    expect(screen.getByRole("button", { name: "Start another call" })).toBeTruthy();
  });

  it("holds a live call in the thinking state", async () => {
    render(<TryPreview clinic={clinic} state="thinking" />);
    fireEvent.click(screen.getByRole("button", { name: "Start call" }));
    await waitFor(() => expect(screen.getByTestId("state-label").textContent).toBe("Thinking"));
    expect(screen.getByText("19:48 left in this call")).toBeTruthy();
    expect(screen.getByRole("button", { name: "End call" })).toBeTruthy();
  });

  it.each([
    ["error-mic", "Microphone is blocked"],
    ["error-session", "Your session expired"],
    ["error-busy", "All call lines are busy"],
    ["error-minutes", "Monthly call minutes used up"],
    ["error-voice", "The voice service is having trouble"],
    ["error-start", "The call could not start"],
    ["error-config", "Calls are not available"],
    ["error-network", "Could not reach the sign-in service"],
    ["lost", "The call could not start"],
  ] as const)("%s shows %s", async (state, title) => {
    render(<TryPreview clinic={clinic} state={state} />);
    fireEvent.click(screen.getByRole("button", { name: "Start call" }));
    expect(within(await screen.findByRole("alert")).getByText(title)).toBeTruthy();
    if (state === "lost")
      expect(screen.getByTestId("state-label").textContent).toBe("Connection lost");
  });
});
