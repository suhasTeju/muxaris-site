"use client";
import { Sparkles } from "lucide-react";
import type { UsageSummary } from "@muxaris/shared";
import { Button, UsageMeter } from "@/components/ui";
import { DefList, SettingsSection } from "./settings/settings-ui";

/** Latest subscription states where a new checkout would conflict with the stuck one. */
const PAYMENT_STUCK = ["halted", "pending", "authenticated"];

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

const n = (v: number) => v.toLocaleString("en-IN");

/** Settings → Plan: plan, included minutes, pilot end, this month's meter, overage and upgrade. */
export function PlanSettings({
  usage,
  isOwner,
  billing,
  tz,
  onUpgrade,
  upgradeDisabled,
  subscriptionStatus,
  busy = false,
  paid = false,
  error,
}: {
  usage: UsageSummary | null;
  isOwner: boolean;
  billing: { enabled: boolean };
  tz: string;
  onUpgrade?: () => void;
  upgradeDisabled?: boolean;
  /** Status of the clinic's latest subscription, if any. */
  subscriptionStatus?: string | undefined;
  /** Checkout is opening. */
  busy?: boolean;
  /** Razorpay reported the payment; the webhook updates the plan shortly. */
  paid?: boolean;
  error?: string | null | undefined;
}) {
  if (!usage) {
    return (
      <SettingsSection id="set-plan" title="Plan">
        <p role="alert" className="text-rose m-0 p-[20px] text-[13.5px]">
          Couldn&apos;t load your plan. Refresh to try again.
        </p>
      </SettingsSection>
    );
  }
  const used = Math.ceil(usage.callSeconds / 60);
  const included = usage.includedCallMinutes;
  const over = Math.ceil(usage.overageSeconds / 60);
  const pilot = usage.plan === "pilot";
  const stuck = PAYMENT_STUCK.includes(subscriptionStatus ?? "");
  const canUpgrade = isOwner && pilot && billing.enabled && !stuck && !paid;
  const footer = paid
    ? "Payment received. Your plan updates within a minute."
    : !isOwner
      ? "Only the clinic owner can change the plan."
      : !pilot
        ? "You are on Standard. Cancel any time by writing to hello@muxaris.com."
        : !billing.enabled
          ? "Upgrading is handled by us for now. Write to hello@muxaris.com."
          : stuck
            ? "Payment pending or failed. Update your payment method in Razorpay or contact support."
            : "";
  return (
    <SettingsSection
      id="set-plan"
      title="Plan"
      aside={
        <span className="bg-teal-soft text-teal-ink inline-flex h-[24px] items-center rounded-7 px-[9px] text-[12.5px] font-semibold">
          {usage.planName}
        </span>
      }
    >
      <DefList
        rows={[
          [
            "Plan",
            usage.priceInrMonthly
              ? `${usage.planName} · ₹${n(usage.priceInrMonthly)} per month`
              : `${usage.planName} · ₹0`,
          ],
          ["Included", `${n(included)} minutes included`],
          ...(usage.pilotEndsAt
            ? ([["Pilot ends", formatDate(usage.pilotEndsAt, tz)]] as Array<[string, string]>)
            : []),
          ["Used this month", `${n(used)} / ${n(included)} min`],
        ]}
      />
      <div className="flex flex-col gap-[12px] px-[20px] py-[16px]">
        <UsageMeter used={used} included={included} height={8} />
        {over > 0 ? (
          <span className="text-rose text-[13px]">
            Overage: {over} min, billed at the per-minute rate agreed with you.
          </span>
        ) : null}
        <div className="border-chip flex items-center justify-between gap-[12px] border-t pt-[12px]">
          <span role={paid || stuck ? "status" : undefined} className="text-ink-3 text-[13.5px]">
            {footer}
          </span>
          {canUpgrade ? (
            <Button
              icon={Sparkles}
              iconSize={14}
              onClick={onUpgrade}
              disabled={busy || (upgradeDisabled ?? false)}
              className="text-[13.5px]"
            >
              {busy ? "Opening checkout…" : "Upgrade to Standard"}
            </Button>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="text-rose m-0 text-[13px]">
            {error}
          </p>
        ) : null}
      </div>
    </SettingsSection>
  );
}
