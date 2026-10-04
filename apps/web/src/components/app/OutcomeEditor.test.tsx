// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Call } from "@muxaris/shared";
import { ApiError } from "@/lib/api";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ useApi: () => api }));

import { OutcomeEditor } from "./OutcomeEditor";

afterEach(() => {
  cleanup();
  api.mockReset();
});

const call = (over: Partial<Call> = {}) =>
  ({ id: "c1", outcome: "info", outcomeSource: "worker", ...over }) as unknown as Call;

describe("OutcomeEditor", () => {
  it("PATCHes the chosen outcome and hands the updated call up", async () => {
    const updated = call({ outcome: "booked", outcomeSource: "staff" });
    api.mockResolvedValue({ call: updated });
    const onSaved = vi.fn();
    render(<OutcomeEditor call={call()} onSaved={onSaved} />);
    expect(screen.queryByText("Edited by staff")).toBeNull();
    const save = screen.getByRole("button", { name: "Save outcome" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Outcome"), { target: { value: "booked" } });
    fireEvent.click(save);
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/v1/calls/c1", {
        method: "PATCH",
        body: { outcome: "booked" },
      }),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(updated));
  });

  it("shows the Edited by staff badge when the outcome came from staff", () => {
    render(<OutcomeEditor call={call({ outcomeSource: "staff" })} onSaved={vi.fn()} />);
    expect(screen.getByText("Edited by staff")).toBeTruthy();
  });

  it("shows an inline error and keeps the selection when saving fails", async () => {
    api.mockRejectedValue(new ApiError(500, "boom", "Could not save"));
    const onSaved = vi.fn();
    render(<OutcomeEditor call={call()} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("Outcome"), { target: { value: "handoff" } });
    fireEvent.click(screen.getByRole("button", { name: "Save outcome" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Could not save");
    expect((screen.getByLabelText("Outcome") as HTMLSelectElement).value).toBe("handoff");
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("follows a worker-set outcome arriving from a poll, so Save cannot overwrite it", () => {
    const { rerender } = render(<OutcomeEditor call={call()} onSaved={vi.fn()} />);
    rerender(<OutcomeEditor call={call({ outcome: "callback" })} onSaved={vi.fn()} />);
    expect((screen.getByLabelText("Outcome") as HTMLSelectElement).value).toBe("callback");
    expect(
      (screen.getByRole("button", { name: "Save outcome" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
