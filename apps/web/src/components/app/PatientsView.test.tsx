// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ useApi: () => api }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { PatientsView } from "./PatientsView";

afterEach(() => {
  cleanup();
  api.mockReset();
  vi.useRealTimers();
});

describe("PatientsView", () => {
  it("keeps what was typed and searches after the debounce", async () => {
    vi.useFakeTimers();
    api.mockResolvedValue({ patients: [], total: 0 });
    render(<PatientsView initial={[]} initialTotal={0} tz="Asia/Kolkata" />);
    const input = screen.getByLabelText("Search patients") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "rav" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    expect(input.value).toBe("rav");
    expect(api).toHaveBeenCalledWith("/v1/patients?limit=50&offset=0&q=rav");
  });
});
