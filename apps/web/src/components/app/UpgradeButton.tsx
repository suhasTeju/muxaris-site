"use client";

import { useState } from "react";
import type { UsageSummary } from "@muxaris/shared";
import { useApi } from "@/lib/api-client";
import { PlanSettings } from "./PlanSettings";

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open(): void };
  }
}

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = CHECKOUT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load the payment window. Try again."));
    document.body.appendChild(s);
  });
}

/** Client wrapper: runs the Razorpay checkout for PlanSettings' Upgrade button. */
export function UpgradeButton(props: {
  usage: UsageSummary | null;
  isOwner: boolean;
  billing: { enabled: boolean };
  tz: string;
}) {
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (busy) return;
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
      setError(e instanceof Error ? e.message : "Could not start the upgrade");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <PlanSettings {...props} onUpgrade={start} />
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
