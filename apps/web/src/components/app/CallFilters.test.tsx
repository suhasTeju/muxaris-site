// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/app/calls",
  useSearchParams: () => new URLSearchParams(),
}));

import { CallFilters } from "./CallFilters";

afterEach(() => {
  cleanup();
  push.mockReset();
});

describe("CallFilters", () => {
  it("writes the outcome to the URL", () => {
    render(<CallFilters value={{}} />);
    fireEvent.change(screen.getByLabelText("Outcome"), { target: { value: "booked" } });
    expect(push).toHaveBeenCalledWith("/app/calls?outcome=booked");
  });

  it("keeps the other filters and never carries an offset", () => {
    render(<CallFilters value={{ outcome: "info", status: "completed" }} />);
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-01" } });
    const q = new URLSearchParams(String(push.mock.calls[0]?.[0]).split("?")[1]);
    expect(q.get("outcome")).toBe("info");
    expect(q.get("status")).toBe("completed");
    expect(q.get("from")).toBe("2026-10-01");
    expect(q.has("offset")).toBe(false);
  });

  it("clearing one filter removes it; Clear filters goes to the bare path", () => {
    render(<CallFilters value={{ outcome: "info", status: "failed" }} />);
    fireEvent.change(screen.getByLabelText("Outcome"), { target: { value: "" } });
    expect(push).toHaveBeenLastCalledWith("/app/calls?status=failed");
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(push).toHaveBeenLastCalledWith("/app/calls");
  });

  it("hides Clear filters when nothing is set", () => {
    render(<CallFilters value={{}} />);
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
  });
});
