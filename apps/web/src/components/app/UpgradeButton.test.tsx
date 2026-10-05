// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UsageSummary } from "@muxaris/shared";
import { ApiError } from "@/lib/api";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ useApi: () => api }));

import { UpgradeButton } from "./UpgradeButton";

const usage: UsageSummary = {
  month: "2026-10",
  callSeconds: 600,
  calls: 4,
  llmInputTokens: 0,
  llmOutputTokens: 0,
  includedCallMinutes: 300,
  overageSeconds: 0,
  plan: "pilot",
  planName: "Pilot",
  priceInrMonthly: 0,
  maxConcurrentCalls: 2,
  pilotEndsAt: null,
};

afterEach(() => {
  cleanup();
  api.mockReset();
  delete (window as { Razorpay?: unknown }).Razorpay;
});

describe("UpgradeButton", () => {
  it("starts a subscription, opens checkout and shows the success text", async () => {
    api.mockResolvedValue({ subscriptionId: "s1", providerSubscriptionId: "sub_1", keyId: "k" });
    const seen: Array<Record<string, unknown>> = [];
    window.Razorpay = class {
      constructor(private opts: Record<string, unknown>) {
        seen.push(opts);
      }
      open() {
        (this.opts.handler as () => void)();
      }
    };
    render(<UpgradeButton usage={usage} isOwner billing={{ enabled: true }} tz="Asia/Kolkata" />);
    fireEvent.click(screen.getByRole("button", { name: "Upgrade to Standard" }));
    await waitFor(() =>
      expect(screen.getByText("Payment received. Your plan updates within a minute.")).toBeTruthy(),
    );
    expect(api).toHaveBeenCalledWith("/v1/billing/subscriptions", { method: "POST", body: {} });
    expect(seen[0]).toMatchObject({ key: "k", subscription_id: "sub_1", name: "Muxaris" });
  });

  it("shows the error text when the API refuses", async () => {
    api.mockRejectedValue(new ApiError(403, "forbidden", "owner role required"));
    render(<UpgradeButton usage={usage} isOwner billing={{ enabled: true }} tz="Asia/Kolkata" />);
    fireEvent.click(screen.getByRole("button", { name: "Upgrade to Standard" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("owner role"));
  });

  it("two rapid clicks make exactly one POST and the button is disabled while busy", async () => {
    let release: (v: unknown) => void = () => undefined;
    api.mockReturnValue(new Promise((r) => (release = r)));
    window.Razorpay = class {
      open() {}
    };
    render(<UpgradeButton usage={usage} isOwner billing={{ enabled: true }} tz="Asia/Kolkata" />);
    const btn = screen.getByRole("button", { name: "Upgrade to Standard" }) as HTMLButtonElement;
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(api).toHaveBeenCalledTimes(1);
    expect(btn.disabled).toBe(true);
    release({ providerSubscriptionId: "sub_1", keyId: "k" });
    await waitFor(() => expect(btn.disabled).toBe(false));
  });

  it("disables the button once payment is received", async () => {
    api.mockResolvedValue({ providerSubscriptionId: "sub_1", keyId: "k" });
    window.Razorpay = class {
      constructor(private opts: Record<string, unknown>) {}
      open() {
        (this.opts.handler as () => void)();
      }
    };
    render(<UpgradeButton usage={usage} isOwner billing={{ enabled: true }} tz="Asia/Kolkata" />);
    const btn = screen.getByRole("button", { name: "Upgrade to Standard" }) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    expect(btn.disabled).toBe(true);
  });

  it("a failed script load shows an error, removes the tag and the next click retries", async () => {
    api.mockResolvedValue({ providerSubscriptionId: "sub_1", keyId: "k" });
    render(<UpgradeButton usage={usage} isOwner billing={{ enabled: true }} tz="Asia/Kolkata" />);
    const scripts = () => document.querySelectorAll('script[src*="checkout.razorpay.com"]');
    fireEvent.click(screen.getByRole("button", { name: "Upgrade to Standard" }));
    await waitFor(() => expect(scripts()).toHaveLength(1));
    const first = scripts()[0]!;
    first.dispatchEvent(new Event("error"));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("could not be loaded"),
    );
    expect(document.body.contains(first)).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Upgrade to Standard" }));
    await waitFor(() => expect(scripts()).toHaveLength(1));
    expect(scripts()[0]).not.toBe(first);
  });

  it("explains a 409 instead of showing the raw message", async () => {
    api.mockRejectedValue(new ApiError(409, "conflict", "clinic already has a subscription"));
    render(<UpgradeButton usage={usage} isOwner billing={{ enabled: true }} tz="Asia/Kolkata" />);
    fireEvent.click(screen.getByRole("button", { name: "Upgrade to Standard" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "Your clinic already has a subscription. Refresh the page to see its status.",
      ),
    );
  });
});
