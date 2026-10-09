import type { UsageSummary } from "@muxaris/shared";
import { describe, expect, it } from "vitest";
import { usageCard } from "./usage";

const pilot: UsageSummary = {
  month: "2026-10",
  callSeconds: 600,
  calls: 4,
  llmInputTokens: 0,
  llmOutputTokens: 0,
  includedCallMinutes: 500,
  overageSeconds: 0,
  plan: "pilot",
  planName: "Pilot",
  priceInrMonthly: 0,
  maxConcurrentCalls: 2,
  // 20:00 UTC on 25 Oct is already 26 Oct in India.
  pilotEndsAt: "2026-10-25T20:00:00.000Z",
};

describe("usageCard", () => {
  it("dates the pilot end in the clinic's timezone", () => {
    expect(usageCard(pilot, "Asia/Kolkata").hint).toBe("Pilot ends 26 Oct 2026");
    expect(usageCard(pilot, "Europe/London").hint).toBe("Pilot ends 25 Oct 2026");
    expect(usageCard(pilot).hint).toBe("Pilot ends 26 Oct 2026");
  });

  it("reads minutes and the plan hint", () => {
    const c = usageCard({ ...pilot, plan: "standard", planName: "Standard", pilotEndsAt: null });
    expect(c).toMatchObject({ used: 10, included: 500, hint: "Standard plan" });
  });
});
