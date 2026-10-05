// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Call } from "@muxaris/shared";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ useApi: () => api }));
vi.mock("@/lib/dashboard", async (orig) => ({
  ...(await orig<typeof import("@/lib/dashboard")>()),
  CALLS_PAGE_SIZE: 2,
}));

import { maskPhone } from "@muxaris/shared";
import { CallsBrowser } from "./CallsBrowser";

afterEach(() => {
  cleanup();
  api.mockReset();
});

const call = (id: string, phone: string) =>
  ({
    id,
    startedAt: "2026-10-06T04:00:00Z",
    channel: "phone",
    callerPhoneMasked: maskPhone(phone),
    durationS: 30,
    languageDetected: "en-IN",
    outcome: "info",
    status: "completed",
  }) as unknown as Call;

describe("CallsBrowser", () => {
  it("appends the next page by offset, drops duplicates and hides Load more at the end", async () => {
    api.mockResolvedValue({ calls: [call("b", "+919000000002")] });
    render(
      <CallsBrowser
        initial={[call("a", "+919000000001"), call("b", "+919000000002")]}
        tz="Asia/Kolkata"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/v1/calls?limit=2&offset=2"));
    // "b" came back again (a call arrived between pages): shown once; short page means done.
    await waitFor(() => expect(screen.queryByRole("button", { name: "Load more" })).toBeNull());
    expect(screen.getAllByText("+91 •••• ••0002")).toHaveLength(1);
  });
  it("shows an inline error and keeps Load more when the request fails", async () => {
    api.mockRejectedValue(new Error("boom"));
    render(
      <CallsBrowser
        initial={[call("a", "+919000000001"), call("b", "+919000000002")]}
        tz="Asia/Kolkata"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect((await screen.findByRole("alert")).textContent).toBe("boom");
    expect(screen.getByRole("button", { name: "Load more" })).toBeTruthy();
  });
  it("sends the active filters with every Load more page and explains an empty result", async () => {
    api.mockResolvedValue({ calls: [] });
    render(
      <CallsBrowser
        initial={[call("a", "+919000000001"), call("b", "+919000000002")]}
        tz="Asia/Kolkata"
        filters={{ outcome: "booked" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/v1/calls?outcome=booked&limit=2&offset=2"),
    );
    cleanup();
    render(<CallsBrowser initial={[]} tz="Asia/Kolkata" filters={{ outcome: "booked" }} />);
    expect(screen.getByText("No calls match these filters.")).toBeTruthy();
  });
});
