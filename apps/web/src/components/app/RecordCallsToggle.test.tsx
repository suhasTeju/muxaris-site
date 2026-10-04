// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ useApi: () => api }));

import { RecordCallsToggle } from "./RecordCallsToggle";

afterEach(() => {
  cleanup();
  api.mockReset();
});

describe("RecordCallsToggle", () => {
  it("PATCHes recordCalls and shows the saved state", async () => {
    api.mockResolvedValue({ clinic: { settings: { recordCalls: false } } });
    render(<RecordCallsToggle clinicId="cl1" initial={true} isOwner />);
    expect(screen.getByText("When off, calls are transcribed but no audio is kept.")).toBeTruthy();
    const sw = screen.getByRole("switch", { name: "Record calls" }) as HTMLButtonElement;
    expect(sw.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(sw);
    expect(sw.disabled).toBe(true);
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/v1/clinics/cl1", {
        method: "PATCH",
        body: { settings: { recordCalls: false } },
      }),
    );
    await waitFor(() => expect(sw.getAttribute("aria-checked")).toBe("false"));
    expect(sw.disabled).toBe(false);
    expect(screen.getByText("Saved")).toBeTruthy();
  });

  it("keeps the old value and shows an error when saving fails", async () => {
    api.mockRejectedValue(new Error("boom"));
    render(<RecordCallsToggle clinicId="cl1" initial={true} isOwner />);
    const sw = screen.getByRole("switch", { name: "Record calls" });
    fireEvent.click(sw);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(sw.getAttribute("aria-checked")).toBe("true");
  });

  it("non-owners see read-only text and no switch", () => {
    render(<RecordCallsToggle clinicId="cl1" initial={false} isOwner={false} />);
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.getByText(/Off/)).toBeTruthy();
  });
});
