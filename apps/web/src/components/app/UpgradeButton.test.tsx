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
});
