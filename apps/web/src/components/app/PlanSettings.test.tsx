// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UsageSummary } from "@muxaris/shared";
import { PlanSettings } from "./PlanSettings";

afterEach(cleanup);

const usage: UsageSummary = {
  month: "2026-10",
  callSeconds: 3600,
  calls: 20,
  llmInputTokens: 0,
  llmOutputTokens: 0,
  includedCallMinutes: 500,
  overageSeconds: 720,
  plan: "pilot",
  planName: "Pilot",
  priceInrMonthly: 0,
  maxConcurrentCalls: 2,
  pilotEndsAt: "2026-11-04T06:30:00.000Z",
};

describe("PlanSettings", () => {
  it("shows plan, included minutes, pilot end, usage meter and overage", () => {
    render(<PlanSettings usage={usage} isOwner billing={{ enabled: false }} tz="Asia/Kolkata" />);
    expect(screen.getByText(/^Pilot · ₹0/)).toBeTruthy();
    expect(screen.getByText("500 minutes included")).toBeTruthy();
    expect(screen.getByText("Pilot ends")).toBeTruthy();
    expect(screen.getByText("4 Nov 2026")).toBeTruthy();
    expect(screen.getByText("60 / 500 min")).toBeTruthy();
    expect(screen.getByRole("meter", { name: "Minutes used" }).getAttribute("aria-valuenow")).toBe(
      "12",
    );
    expect(screen.getByText(/Overage: 12 min/)).toBeTruthy();
  });

  it("billing disabled: no button, contact copy", () => {
    render(<PlanSettings usage={usage} isOwner billing={{ enabled: false }} tz="Asia/Kolkata" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByText("Upgrading is handled by us for now. Write to hello@muxaris.com."),
    ).toBeTruthy();
  });

  it("billing disabled wins over the role and the plan, as before the redesign", () => {
    const copy = "Upgrading is handled by us for now. Write to hello@muxaris.com.";
    render(
      <PlanSettings usage={usage} isOwner={false} billing={{ enabled: false }} tz="Asia/Kolkata" />,
    );
    expect(screen.getByText(copy)).toBeTruthy();
    expect(screen.queryByText("Only the clinic owner can change the plan.")).toBeNull();
    cleanup();
    render(
      <PlanSettings
        usage={{ ...usage, plan: "standard", planName: "Standard", pilotEndsAt: null }}
        isOwner
        billing={{ enabled: false }}
        tz="Asia/Kolkata"
      />,
    );
    expect(screen.getByText(copy)).toBeTruthy();
  });

  it("pilot with a halted subscription: payment message instead of the Upgrade button", () => {
    render(
      <PlanSettings
        usage={usage}
        isOwner
        billing={{ enabled: true }}
        tz="Asia/Kolkata"
        subscriptionStatus="halted"
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByText(
        "Payment pending or failed. Update your payment method in Razorpay or contact support.",
      ),
    ).toBeTruthy();
  });

  it("billing enabled, not owner: no button, owner-only copy", () => {
    render(
      <PlanSettings usage={usage} isOwner={false} billing={{ enabled: true }} tz="Asia/Kolkata" />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Only the clinic owner can change the plan.")).toBeTruthy();
  });

  it("billing enabled, owner, pilot: Upgrade button calls onUpgrade", () => {
    const onUpgrade = vi.fn();
    render(
      <PlanSettings
        usage={usage}
        isOwner
        billing={{ enabled: true }}
        tz="Asia/Kolkata"
        onUpgrade={onUpgrade}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Upgrade to Standard" }));
    expect(onUpgrade).toHaveBeenCalledOnce();
  });

  it("standard plan: no button, cancellation copy", () => {
    render(
      <PlanSettings
        usage={{ ...usage, plan: "standard", planName: "Standard", priceInrMonthly: 4999 }}
        isOwner
        billing={{ enabled: true }}
        tz="Asia/Kolkata"
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Standard · ₹4,999 per month")).toBeTruthy();
    expect(
      screen.getByText("You are on Standard. Cancel any time by writing to hello@muxaris.com."),
    ).toBeTruthy();
  });

  it("paid: payment-received copy replaces the Upgrade button", () => {
    render(
      <PlanSettings usage={usage} isOwner billing={{ enabled: true }} tz="Asia/Kolkata" paid />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Payment received. Your plan updates within a minute.")).toBeTruthy();
  });

  it("null usage shows an alert", () => {
    render(<PlanSettings usage={null} isOwner billing={{ enabled: false }} tz="Asia/Kolkata" />);
    expect(screen.getByRole("alert").textContent).toContain("Couldn't load your plan");
  });
});
