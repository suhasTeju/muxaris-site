"use client";

import { useRef, useState } from "react";
import type { UsageSummary } from "@muxaris/shared";
import { ApiError } from "@/lib/api";
import { useApi } from "@/lib/api-client";
import { PlanSettings } from "./PlanSettings";

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open(): void };
  }
}

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

let checkoutLoading: Promise<void> | null = null;

function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (checkoutLoading) return checkoutLoading;
  const p = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = CHECKOUT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      s.remove();
      checkoutLoading = null;
      reject(new Error("Checkout could not be loaded. Check your connection and try again."));
    };
    document.body.appendChild(s);
  });
  checkoutLoading = p;
  return p;
}

/** Client wrapper: runs the Razorpay checkout for PlanSettings' Upgrade button. */
export function UpgradeButton(props: {
  usage: UsageSummary | null;
  isOwner: boolean;
  billing: { enabled: boolean };
  tz: string;
  subscriptionStatus?: string | undefined;
}) {
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function start() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ providerSubscriptionId: string; keyId: string }>(
        "/v1/billing/subscriptions",
        { method: "POST", body: {} },
      );
      await loadCheckout();
      if (!window.Razorpay) throw new Error("Could not load the payment window. Try again.");
      new window.Razorpay({
        key: r.keyId,
        subscription_id: r.providerSubscriptionId,
        name: "Muxaris",
        description: "Standard plan",
        handler: () => setDone(true),
      }).open();
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? "Your clinic already has a subscription. Refresh the page to see its status."
          : e instanceof Error
            ? e.message
            : "Could not start the upgrade",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <PlanSettings {...props} onUpgrade={start} upgradeDisabled={busy || done} />
      {done ? (
        <p role="status" className="text-sm">
          Payment received. Your plan updates within a minute.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
