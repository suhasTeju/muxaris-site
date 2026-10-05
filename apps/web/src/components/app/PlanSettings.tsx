"use client";
import type { UsageSummary } from "@muxaris/shared";
import { primaryBtn } from "./Modal";

function formatDate(iso: string, tz: string): string {
  let timeZone: string | undefined = tz;
  try {
    new Intl.DateTimeFormat("en-IN", { timeZone: tz });
  } catch {
    timeZone = undefined;
  }
  return new Intl.DateTimeFormat("en-IN", {
    ...(timeZone ? { timeZone } : {}),
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

function Line({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1">
      <dt className="text-muted">{k}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

export function PlanSettings({
  usage,
  isOwner,
  billing,
  tz,
  onUpgrade,
  upgradeDisabled,
}: {
  usage: UsageSummary | null;
  isOwner: boolean;
  billing: { enabled: boolean };
  tz: string;
  onUpgrade?: () => void;
  upgradeDisabled?: boolean;
}) {
  if (!usage) {
    return (
      <p role="alert" className="text-danger text-sm">
        Couldn&apos;t load your plan. Refresh to try again.
      </p>
    );
  }
  const used = Math.ceil(usage.callSeconds / 60);
  const ratio = usage.includedCallMinutes ? Math.min(1, used / usage.includedCallMinutes) : 0;
  const pct = Math.round(ratio * 100);
  const over = Math.ceil(usage.overageSeconds / 60);
  return (
    <div className="flex flex-col gap-3 text-[15px]">
      <dl>
        <Line k="Plan">
          {usage.planName}
          {usage.priceInrMonthly
            ? ` · ₹${usage.priceInrMonthly.toLocaleString("en-IN")} per month`
            : " · ₹0"}
        </Line>
        <Line k="Included">{`${usage.includedCallMinutes.toLocaleString("en-IN")} minutes included`}</Line>
        {usage.pilotEndsAt ? (
          <Line k="Pilot ends">{`Pilot ends ${formatDate(usage.pilotEndsAt, tz)}`}</Line>
        ) : null}
        <Line k="Used this month">{`${used} / ${usage.includedCallMinutes} min`}</Line>
      </dl>
      <div
        role="meter"
        aria-label="Minutes used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--color-ink)_8%,white)]"
      >
        <div
          className={`h-full rounded-full ${ratio >= 0.9 ? "bg-danger" : "bg-accent"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {over > 0 ? (
        <p className="text-sm">
          Overage: {over} min, billed at the per-minute rate agreed with you.
        </p>
      ) : null}
      {!billing.enabled ? (
        <p className="text-muted text-sm">
          Upgrading is handled by us for now. Write to hello@muxaris.com.
        </p>
      ) : !isOwner ? (
        <p className="text-muted text-sm">Only the clinic owner can change the plan.</p>
      ) : usage.plan === "pilot" ? (
        <button
          type="button"
          onClick={onUpgrade}
          disabled={upgradeDisabled ?? false}
          className={`${primaryBtn} self-start`}
        >
          Upgrade to Standard
        </button>
      ) : (
        <p className="text-muted text-sm">
          You are on Standard. Cancel any time by writing to hello@muxaris.com.
        </p>
      )}
    </div>
  );
}
