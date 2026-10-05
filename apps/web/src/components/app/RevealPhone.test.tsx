// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ useApi: () => api }));

import { RevealPhone } from "./RevealPhone";

afterEach(() => {
  cleanup();
  api.mockReset();
});

describe("RevealPhone", () => {
  it("shows the masked number until clicked, then a tel: link from the reveal endpoint", async () => {
    api.mockResolvedValue({ phone: "+919876543210" });
    render(<RevealPhone masked="+91 •••• ••3210" path="/v1/patients/pat_1/reveal-phone" />);
    expect(screen.getByText("+91 •••• ••3210")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /show number/i }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/v1/patients/pat_1/reveal-phone", { method: "POST" }),
    );
    const link = (await screen.findByRole("link", { name: "+919876543210" })) as HTMLAnchorElement;
    expect(link.href).toBe("tel:+919876543210");
  });

  it("hides the number again after 60 seconds", async () => {
    vi.useFakeTimers();
    api.mockResolvedValue({ phone: "+919876543210" });
    render(<RevealPhone masked="+91 •••• ••3210" path="/v1/patients/pat_1/reveal-phone" />);
    fireEvent.click(screen.getByRole("button", { name: /show number/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole("link", { name: "+919876543210" })).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("+91 •••• ••3210")).toBeTruthy();
    vi.useRealTimers();
  });

  it("explains a purged callback", async () => {
    api.mockRejectedValue(
      Object.assign(new Error("callback contact details were purged"), { status: 409 }),
    );
    render(<RevealPhone masked="+91 •••• ••0001" path="/v1/callbacks/cb_1/reveal-phone" />);
    fireEvent.click(screen.getByRole("button", { name: /show number/i }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/purged|no longer/i);
  });
});
